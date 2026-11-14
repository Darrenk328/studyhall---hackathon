import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { FALLBACK_BETA } from "../src/config/models.js";
import { ClaudeClient, ClaudeRefusalError, ClaudeTruncatedError } from "../src/providers/claude.js";

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

function fakeAnthropic(handlers: { create?: unknown; parse?: unknown; stream?: unknown }) {
  const messages = {
    create: vi.fn(async () => handlers.create),
    parse: vi.fn(async () => handlers.parse),
    stream: vi.fn(() => handlers.stream),
  };
  return { client: { beta: { messages } } as unknown as Pick<Anthropic, "beta">, messages };
}

describe("ClaudeClient.buildParams", () => {
  const claude = new ClaudeClient({ client: fakeAnthropic({}).client });

  it("answer/verify use Sonnet with adaptive thinking and default fallback", () => {
    const p = claude.buildParams({ role: "answer", system: "sys", prompt: "q" });
    expect(p).toMatchObject({
      model: "claude-sonnet-5-5",
      system: "sys",
      thinking: { type: "adaptive" },
      fallbacks: "default",
      betas: [FALLBACK_BETA],
      messages: [{ role: "user", content: "q" }],
    });
    expect(p).not.toHaveProperty("temperature");
  });

  it("plan/classify use Haiku with thinking off and no fallback", () => {
    const p = claude.buildParams({ role: "plan", prompt: "q" });
    expect(p).toMatchObject({ model: "claude-haiku-5-5", thinking: { type: "disabled" }, output_config: { effort: "low" } });
    expect(p).not.toHaveProperty("fallbacks");
    expect(p).not.toHaveProperty("betas");
  });

  it("allows per-role overrides", () => {
    const c = new ClaudeClient({ client: fakeAnthropic({}).client, settings: { answer: { effort: "high" } } });
    expect(c.buildParams({ role: "answer", prompt: "q" }).output_config).toEqual({ effort: "high" });
  });
});

describe("ClaudeClient.text", () => {
  it("joins text blocks and ignores thinking blocks", async () => {
    const content = [
      { type: "thinking", thinking: "", signature: "s" },
      { type: "text", text: "A " },
      { type: "text", text: "B" },
    ];
    const { client } = fakeAnthropic({ create: message({ content } as Msg) });
    const r = await new ClaudeClient({ client }).text({ role: "answer", prompt: "q" });
    expect(r).toMatchObject({ text: "A B", truncated: false, servedByFallback: false, usage: { inputTokens: 10, outputTokens: 3 } });
  });

  it("raises ClaudeRefusalError with the category", async () => {
    const { client } = fakeAnthropic({
      create: message({ stop_reason: "refusal", stop_details: { type: "refusal", category: "bio", explanation: "x" } } as Msg),
    });
    await expect(new ClaudeClient({ client }).text({ role: "answer", prompt: "q" })).rejects.toMatchObject({
      name: "ClaudeRefusalError",
      category: "bio",
    });
  });

  it("flags truncation and fallback service", async () => {
    const { client } = fakeAnthropic({
      create: message({
        stop_reason: "max_tokens",
        usage: { input_tokens: 1, output_tokens: 1, iterations: [{ type: "fallback_message" }] },
      } as unknown as Msg),
    });
    const r = await new ClaudeClient({ client }).text({ role: "answer", prompt: "q" });
    expect(r).toMatchObject({ truncated: true, servedByFallback: true });
  });
});

describe("ClaudeClient.json", () => {
  const schema = z.object({ queries: z.array(z.string()) });

  it("passes a structured-output format and returns parsed_output", async () => {
    const { client, messages } = fakeAnthropic({ parse: { ...message(), parsed_output: { queries: ["a", "b"] } } });
    const out = await new ClaudeClient({ client }).json({ role: "plan", prompt: "q", schema });
    expect(out).toEqual({ queries: ["a", "b"] });
    const params = (messages.parse.mock.calls[0] as unknown as [Record<string, { format?: unknown; effort?: string }>])[0];
    expect(params.output_config).toMatchObject({ effort: "low" });
    expect(params.output_config!.format).toBeDefined();
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
  it("yields text deltas and returns the final result", async () => {
    const events = [
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo" } },
    ];
    const stream = {
      async *[Symbol.asyncIterator]() {
        yield* events;
      },
      finalMessage: async () => message({ content: [{ type: "text", text: "Hello" }] } as Msg),
    };
    const { client } = fakeAnthropic({ stream });
    const gen = new ClaudeClient({ client }).stream({ role: "answer", prompt: "q" });
    const chunks: string[] = [];
    let step = await gen.next();
    while (!step.done) {
      chunks.push(step.value);
      step = await gen.next();
    }
    expect(chunks).toEqual(["Hel", "lo"]);
    expect(step.value.text).toBe("Hello");
  });
});
