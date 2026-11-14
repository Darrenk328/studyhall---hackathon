import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ClaudeClient, ClaudeRefusalError, ClaudeTruncatedError, isOverloadError } from "../src/providers/claude.js";

type Msg = Partial<Anthropic.Beta.Messages.BetaMessage>;

function message(over: Msg = {}): Anthropic.Beta.Messages.BetaMessage {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text: "Hello [1]", citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 10, output_tokens: 3 },
    ...over,
  } as unknown as Anthropic.Beta.Messages.BetaMessage;
}

const apiError = (status: number) =>
  Anthropic.APIError.generate(status, { type: "error", error: { type: "overloaded_error", message: "x" } }, "x", new Headers());

/** Each handler is either a value or a function of the request params. */
type Handler = unknown | ((params: { model: string }) => unknown);
function fakeAnthropic(handlers: { create?: Handler; parse?: Handler; stream?: Handler }) {
  const run = (h: Handler, params: { model: string }) => (typeof h === "function" ? (h as (p: { model: string }) => unknown)(params) : h);
  const messages = {
    create: vi.fn(async (params: { model: string }) => run(handlers.create, params)),
    parse: vi.fn(async (params: { model: string }) => run(handlers.parse, params)),
    stream: vi.fn((params: { model: string }) => run(handlers.stream, params)),
  };
  return { client: { beta: { messages } } as unknown as Pick<Anthropic, "beta">, messages };
}

function fakeStream(events: unknown[], final: Anthropic.Beta.Messages.BetaMessage, failWith?: unknown) {
  return {
    async *[Symbol.asyncIterator]() {
      if (failWith) throw failWith;
      yield* events;
    },
    finalMessage: async () => final,
  };
}

describe("ClaudeClient.buildParams", () => {
  const claude = new ClaudeClient({ client: fakeAnthropic({}).client });

  it("answer/verify/repair use Sonnet 5.5 with adaptive thinking and no refusal fallback", () => {
    for (const role of ["answer", "verify", "repair"] as const) {
      const p = claude.buildParams({ role, system: "sys", prompt: "q" });
      expect(p).toMatchObject({ model: "claude-sonnet-5-5", system: "sys", thinking: { type: "adaptive" } });
      expect(p).not.toHaveProperty("fallbacks");
      expect(p).not.toHaveProperty("betas");
      expect(p).not.toHaveProperty("temperature");
    }
  });

  it("plan/classify use Haiku with thinking off", () => {
    const p = claude.buildParams({ role: "plan", prompt: "q" });
    expect(p).toMatchObject({ model: "claude-haiku-5-5", thinking: { type: "disabled" }, output_config: { effort: "low" } });
  });

  it("allows per-role overrides", () => {
    const c = new ClaudeClient({ client: fakeAnthropic({}).client, settings: { answer: { effort: "high" } } });
    expect(c.buildParams({ role: "answer", prompt: "q" }).output_config).toEqual({ effort: "high" });
  });
});

describe("ClaudeClient.text", () => {
  it("joins text blocks, ignores thinking blocks, and reports the serving model", async () => {
    const content = [
      { type: "thinking", thinking: "", signature: "s" },
      { type: "text", text: "A " },
      { type: "text", text: "B" },
    ];
    const { client } = fakeAnthropic({ create: message({ content } as Msg) });
    const r = await new ClaudeClient({ client }).text({ role: "answer", prompt: "q" });
    expect(r).toMatchObject({ text: "A B", model: "claude-sonnet-5-5", truncated: false, failedOver: false });
  });

  it("raises ClaudeRefusalError and does not retry on another model", async () => {
    const { client, messages } = fakeAnthropic({
      create: message({ stop_reason: "refusal", stop_details: { type: "refusal", category: "bio", explanation: "x" } } as Msg),
    });
    await expect(new ClaudeClient({ client }).text({ role: "answer", prompt: "q" })).rejects.toMatchObject({
      name: "ClaudeRefusalError",
      category: "bio",
      model: "claude-sonnet-5-5",
    });
    expect(messages.create).toHaveBeenCalledTimes(1);
  });

  it("flags truncation", async () => {
    const { client } = fakeAnthropic({ create: message({ stop_reason: "max_tokens" }) });
    expect(await new ClaudeClient({ client }).text({ role: "answer", prompt: "q" })).toMatchObject({ truncated: true });
  });
});

describe("overload failover", () => {
  it("classifies only 5xx/529 as overload", () => {
    expect(isOverloadError(apiError(529))).toBe(true);
    expect(isOverloadError(apiError(500))).toBe(true);
    expect(isOverloadError(apiError(429))).toBe(false);
    expect(isOverloadError(apiError(400))).toBe(false);
    expect(isOverloadError(new Error("x"))).toBe(false);
  });

  it("retries once on the failover model after a 529, and records it", async () => {
    const { client, messages } = fakeAnthropic({
      create: (p: { model: string }) => {
        if (p.model === "claude-sonnet-5-5") throw apiError(529);
        return message({ model: p.model });
      },
    });
    const r = await new ClaudeClient({ client }).text({ role: "answer", prompt: "q" });
    expect(r).toMatchObject({ model: "claude-sonnet-5", failedOver: true });
    expect(messages.create.mock.calls.map((c) => c[0].model)).toEqual(["claude-sonnet-5-5", "claude-sonnet-5"]);
  });

  it("does not fail over on 4xx", async () => {
    const { client, messages } = fakeAnthropic({
      create: () => {
        throw apiError(400);
      },
    });
    await expect(new ClaudeClient({ client }).text({ role: "answer", prompt: "q" })).rejects.toBeInstanceOf(Anthropic.BadRequestError);
    expect(messages.create).toHaveBeenCalledTimes(1);
  });

  it("can be turned off per role", async () => {
    const { client, messages } = fakeAnthropic({
      create: () => {
        throw apiError(529);
      },
    });
    const c = new ClaudeClient({ client, settings: { answer: { failoverModel: undefined } } });
    await expect(c.text({ role: "answer", prompt: "q" })).rejects.toBeInstanceOf(Anthropic.APIError);
    expect(messages.create).toHaveBeenCalledTimes(1);
  });
});

describe("ClaudeClient.json", () => {
  const schema = z.object({ queries: z.array(z.string()) });

  it("passes a structured-output format and returns data plus model", async () => {
    const { client, messages } = fakeAnthropic({ parse: { ...message({ model: "claude-haiku-5-5" }), parsed_output: { queries: ["a"] } } });
    const out = await new ClaudeClient({ client }).json({ role: "plan", prompt: "q", schema });
    expect(out).toMatchObject({ data: { queries: ["a"] }, model: "claude-haiku-5-5", failedOver: false });
    const params = messages.parse.mock.calls[0]![0] as unknown as { output_config: { format?: unknown; effort?: string } };
    expect(params.output_config).toMatchObject({ effort: "low" });
    expect(params.output_config.format).toBeDefined();
  });

  it("rejects truncated or refused structured output", async () => {
    const trunc = fakeAnthropic({ parse: { ...message({ stop_reason: "max_tokens" }), parsed_output: null } });
    await expect(new ClaudeClient({ client: trunc.client }).json({ role: "plan", prompt: "q", schema })).rejects.toBeInstanceOf(
      ClaudeTruncatedError,
    );
    const refused = fakeAnthropic({ parse: { ...message({ stop_reason: "refusal" }), parsed_output: null } });
    await expect(new ClaudeClient({ client: refused.client }).json({ role: "plan", prompt: "q", schema })).rejects.toBeInstanceOf(
      ClaudeRefusalError,
    );
  });
});

describe("ClaudeClient.stream", () => {
  const events = [
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } },
    { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo" } },
  ];

  async function drain(gen: AsyncGenerator<string, { text: string; model: string; failedOver: boolean }>) {
    const chunks: string[] = [];
    let step = await gen.next();
    while (!step.done) {
      chunks.push(step.value);
      step = await gen.next();
    }
    return { chunks, final: step.value };
  }

  it("yields text deltas and returns the final result", async () => {
    const { client } = fakeAnthropic({ stream: fakeStream(events, message({ content: [{ type: "text", text: "Hello" }] } as Msg)) });
    const { chunks, final } = await drain(new ClaudeClient({ client }).stream({ role: "answer", prompt: "q" }));
    expect(chunks).toEqual(["Hel", "lo"]);
    expect(final).toMatchObject({ text: "Hello", failedOver: false });
  });

  it("fails over when overloaded before any text arrives", async () => {
    const { client } = fakeAnthropic({
      stream: (p: { model: string }) =>
        p.model === "claude-sonnet-5-5"
          ? fakeStream([], message(), apiError(529))
          : fakeStream(events, message({ model: p.model, content: [{ type: "text", text: "Hello" }] } as Msg)),
    });
    const { chunks, final } = await drain(new ClaudeClient({ client }).stream({ role: "answer", prompt: "q" }));
    expect(chunks).toEqual(["Hel", "lo"]);
    expect(final).toMatchObject({ model: "claude-sonnet-5", failedOver: true });
  });

  it("raises a refusal from the final message", async () => {
    const { client } = fakeAnthropic({ stream: fakeStream([], message({ stop_reason: "refusal" })) });
    await expect(drain(new ClaudeClient({ client }).stream({ role: "answer", prompt: "q" }))).rejects.toBeInstanceOf(ClaudeRefusalError);
  });
});
