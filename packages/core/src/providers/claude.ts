import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { ROLE_SETTINGS, type ModelRole, type RoleSettings } from "../config/models.js";

/**
 * Thin wrapper over the Anthropic SDK.
 *
 * - Retries: the SDK retries the same model (408/409/429/5xx/connection, 2 retries).
 * - Overload failover: if the primary is still overloaded (529) or 5xx after that, the call is
 *   tried once on the role's `failoverModel`. Streams fail over only before any text arrived.
 * - Refusals are never retried on another model: they raise ClaudeRefusalError, and the
 *   pipeline turns that into a `refused` outcome.
 * - Credentials: ANTHROPIC_API_KEY, or an `ant auth login` profile.
 */

type BetaParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type BetaMessage = Anthropic.Beta.Messages.BetaMessage;

export class ClaudeRefusalError extends Error {
  constructor(readonly role: ModelRole, readonly category: string | null, readonly model: string) {
    super(`Claude declined the ${role} request${category ? ` (category: ${category})` : ""}`);
    this.name = "ClaudeRefusalError";
  }
}

export class ClaudeTruncatedError extends Error {
  constructor(readonly role: ModelRole) {
    super(`Claude hit max_tokens on the ${role} request`);
    this.name = "ClaudeTruncatedError";
  }
}

export class ClaudeAuthError extends Error {
  constructor(cause: unknown) {
    super("Anthropic credentials are missing or invalid. Set ANTHROPIC_API_KEY in .env, or run `ant auth login`.", { cause });
    this.name = "ClaudeAuthError";
  }
}

export interface CallInput {
  role: ModelRole;
  system?: string;
  /** A single user turn, or a full message list. */
  prompt: string | Anthropic.Beta.Messages.BetaMessageParam[];
  maxTokens?: number;
  /** Cancels the request; aborts are never failed over or retried. */
  signal?: AbortSignal;
}

export interface CallMeta {
  /** The model that actually produced the output (as reported by the API). */
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  /** True when the primary model was overloaded and the failover model answered. */
  failedOver: boolean;
}

export interface TextResult extends CallMeta {
  text: string;
  truncated: boolean;
}

export interface JsonResult<T> extends CallMeta {
  data: T;
}

export interface ClaudeClientOptions {
  /** Injected for tests. */
  client?: Pick<Anthropic, "beta">;
  timeoutMs?: number;
  maxRetries?: number;
  settings?: Partial<Record<ModelRole, Partial<RoleSettings>>>;
}

/** Overloaded (529) or any 5xx, after the SDK's own retries. Not refusals, not 4xx. */
export function isOverloadError(err: unknown): boolean {
  return err instanceof Anthropic.APIError && typeof err.status === "number" && err.status >= 500;
}

export class ClaudeClient {
  private readonly client: Pick<Anthropic, "beta">;
  private readonly settings: Record<ModelRole, RoleSettings>;

  constructor(opts: ClaudeClientOptions = {}) {
    this.client = opts.client ?? new Anthropic({ timeout: opts.timeoutMs ?? 120_000, maxRetries: opts.maxRetries ?? 2 });
    this.settings = Object.fromEntries(
      (Object.keys(ROLE_SETTINGS) as ModelRole[]).map((r) => [r, { ...ROLE_SETTINGS[r], ...opts.settings?.[r] }]),
    ) as Record<ModelRole, RoleSettings>;
  }

  settingsFor(role: ModelRole): RoleSettings {
    return this.settings[role];
  }

  buildParams(input: CallInput, model?: string): BetaParams {
    const s = this.settings[input.role];
    const messages = typeof input.prompt === "string" ? [{ role: "user" as const, content: input.prompt }] : input.prompt;
    return {
      model: model ?? s.model,
      max_tokens: input.maxTokens ?? s.maxTokens,
      ...(input.system ? { system: input.system } : {}),
      messages,
      thinking: thinkingParam(s.thinking, model ?? s.model),
      output_config: { effort: s.effort },
    };
  }

  /** Run `fn` on the primary model, then once on the failover model if the primary is overloaded. */
  private async withFailover<R>(role: ModelRole, fn: (model: string) => Promise<R>, signal?: AbortSignal): Promise<{ value: R; failedOver: boolean }> {
    const s = this.settings[role];
    try {
      return { value: await fn(s.model), failedOver: false };
    } catch (err) {
      if (s.failoverModel && s.failoverModel !== s.model && isOverloadError(err) && !signal?.aborted) {
        try {
          return { value: await fn(s.failoverModel), failedOver: true };
        } catch (err2) {
          throw mapError(err2);
        }
      }
      throw mapError(err);
    }
  }

  async text(input: CallInput): Promise<TextResult> {
    const { value: msg, failedOver } = await this.withFailover(input.role, (model) =>
      this.client.beta.messages.create(this.buildParams(input, model), reqOpts(input)),
    input.signal);
    return toTextResult(input.role, msg, failedOver);
  }

  /** Structured output validated by Zod. Throws on refusal, truncation or schema mismatch. */
  async json<T extends z.ZodType>(input: CallInput & { schema: T }): Promise<JsonResult<z.infer<T>>> {
    const { value: res, failedOver } = await this.withFailover(input.role, (model) => {
      const params = this.buildParams(input, model);
      return this.client.beta.messages.parse(
        { ...params, output_config: { ...params.output_config, format: betaZodOutputFormat(input.schema) } },
        reqOpts(input),
      );
    }, input.signal);
    checkStop(input.role, res);
    if (res.parsed_output == null) throw new Error(`Claude ${input.role} output did not match the schema`);
    return { data: res.parsed_output as z.infer<T>, ...meta(res, failedOver) };
  }

  /** Stream text deltas. The generator's return value is the final TextResult. */
  async *stream(input: CallInput): AsyncGenerator<string, TextResult> {
    const s = this.settings[input.role];
    const models = [s.model, ...(s.failoverModel && s.failoverModel !== s.model ? [s.failoverModel] : [])];
    for (let i = 0; i < models.length; i++) {
      const stream = this.client.beta.messages.stream(this.buildParams(input, models[i]), reqOpts(input));
      let yielded = false;
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yielded = true;
            yield event.delta.text;
          }
        }
        return toTextResult(input.role, await stream.finalMessage(), i > 0);
      } catch (err) {
        if (!yielded && i < models.length - 1 && isOverloadError(err) && !input.signal?.aborted) continue;
        throw mapError(err);
      }
    }
    throw new Error("unreachable");
  }
}

function reqOpts(input: CallInput): { signal: AbortSignal } | undefined {
  return input.signal ? { signal: input.signal } : undefined;
}

/** Map a role's thinking setting to what the target model accepts. */
export function thinkingParam(mode: RoleSettings["thinking"], model: string): Anthropic.Beta.Messages.BetaThinkingConfigParam {
  if (mode === "adaptive") return { type: "adaptive" };
  if (mode === "off" && model === "claude-sonnet-5-5") return { type: "between_tools" } as Anthropic.Beta.Messages.BetaThinkingConfigParam;
  return { type: "disabled" };
}

function mapError(err: unknown): unknown {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ClaudeAuthError(err);
  }
  if (err instanceof Error && !(err instanceof Anthropic.APIError) && /credentials|api key|apiKey|authToken/i.test(err.message)) {
    return new ClaudeAuthError(err);
  }
  return err;
}

function meta(msg: Pick<BetaMessage, "model" | "usage">, failedOver: boolean): CallMeta {
  return {
    model: msg.model,
    usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
    failedOver,
  };
}

function checkStop(role: ModelRole, msg: Pick<BetaMessage, "stop_reason" | "stop_details" | "model">): void {
  if (msg.stop_reason === "refusal") throw new ClaudeRefusalError(role, msg.stop_details?.category ?? null, msg.model);
  if (msg.stop_reason === "max_tokens") throw new ClaudeTruncatedError(role);
}

export function toTextResult(role: ModelRole, msg: BetaMessage, failedOver = false): TextResult {
  if (msg.stop_reason === "refusal") throw new ClaudeRefusalError(role, msg.stop_details?.category ?? null, msg.model);
  const text = msg.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return { text, truncated: msg.stop_reason === "max_tokens", ...meta(msg, failedOver) };
}
