import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { FALLBACK_BETA, ROLE_SETTINGS, type ModelRole, type RoleSettings } from "../config/models.js";

/**
 * Thin wrapper over the Anthropic SDK. Uses the beta Messages namespace so Sonnet calls can
 * opt into server-side refusal fallback. The SDK handles retries (429/5xx/connection) and
 * resolves credentials: ANTHROPIC_API_KEY, or an `ant auth login` profile.
 */

type BetaParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type BetaMessage = Anthropic.Beta.Messages.BetaMessage;

export class ClaudeRefusalError extends Error {
  constructor(readonly role: ModelRole, readonly category: string | null) {
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
    super(
      "Anthropic credentials are missing or invalid. Set ANTHROPIC_API_KEY in .env, or run `ant auth login`.",
      { cause },
    );
    this.name = "ClaudeAuthError";
  }
}

export interface CallInput {
  role: ModelRole;
  system?: string;
  /** A single user turn, or a full message list. */
  prompt: string | Anthropic.Beta.Messages.BetaMessageParam[];
  maxTokens?: number;
}

export interface TextResult {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  truncated: boolean;
  /** True when a fallback model served the request after the primary declined. */
  servedByFallback: boolean;
}

export interface ClaudeClientOptions {
  /** Injected for tests. */
  client?: Pick<Anthropic, "beta">;
  timeoutMs?: number;
  maxRetries?: number;
  settings?: Partial<Record<ModelRole, Partial<RoleSettings>>>;
}

export class ClaudeClient {
  private readonly client: Pick<Anthropic, "beta">;
  private readonly settings: Record<ModelRole, RoleSettings>;

  constructor(opts: ClaudeClientOptions = {}) {
    this.client =
      opts.client ?? new Anthropic({ timeout: opts.timeoutMs ?? 120_000, maxRetries: opts.maxRetries ?? 2 });
    this.settings = Object.fromEntries(
      (Object.keys(ROLE_SETTINGS) as ModelRole[]).map((r) => [r, { ...ROLE_SETTINGS[r], ...opts.settings?.[r] }]),
    ) as Record<ModelRole, RoleSettings>;
  }

  settingsFor(role: ModelRole): RoleSettings {
    return this.settings[role];
  }

  /** Request params shared by every call for a role. */
  buildParams(input: CallInput): BetaParams {
    const s = this.settings[input.role];
    const messages = typeof input.prompt === "string" ? [{ role: "user" as const, content: input.prompt }] : input.prompt;
    return {
      model: s.model,
      max_tokens: input.maxTokens ?? s.maxTokens,
      ...(input.system ? { system: input.system } : {}),
      messages,
      thinking: s.thinking === "disabled" ? { type: "disabled" } : { type: "adaptive" },
      output_config: { effort: s.effort },
      ...(s.fallback ? { fallbacks: "default" as const, betas: [FALLBACK_BETA] } : {}),
    };
  }

  async text(input: CallInput): Promise<TextResult> {
    const msg = await this.call(() => this.client.beta.messages.create(this.buildParams(input)));
    return toTextResult(input.role, msg);
  }

  /** Structured output validated by Zod. Throws on refusal, truncation or schema mismatch. */
  async json<T extends z.ZodType>(input: CallInput & { schema: T }): Promise<z.infer<T>> {
    const params = this.buildParams(input);
    const res = await this.call(() =>
      this.client.beta.messages.parse({
        ...params,
        output_config: { ...params.output_config, format: betaZodOutputFormat(input.schema) },
      }),
    );
    checkStop(input.role, res);
    if (res.parsed_output == null) throw new Error(`Claude ${input.role} output did not match the schema`);
    return res.parsed_output as z.infer<T>;
  }

  /** Stream text deltas. The generator's return value is the final TextResult. */
  async *stream(input: CallInput): AsyncGenerator<string, TextResult> {
    const stream = this.client.beta.messages.stream(this.buildParams(input));
    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield event.delta.text;
        }
      }
      return toTextResult(input.role, await stream.finalMessage());
    } catch (err) {
      throw mapError(err);
    }
  }

  private async call<R>(fn: () => Promise<R>): Promise<R> {
    try {
      return await fn();
    } catch (err) {
      throw mapError(err);
    }
  }
}

function mapError(err: unknown): unknown {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ClaudeAuthError(err);
  }
  if (err instanceof Error && /credentials|api key|apiKey|authToken/i.test(err.message) && !(err instanceof Anthropic.APIError)) {
    // SDK constructor/request-time "no credentials" errors are plain Errors.
    return new ClaudeAuthError(err);
  }
  return err;
}

function checkStop(role: ModelRole, msg: Pick<BetaMessage, "stop_reason" | "stop_details">): void {
  if (msg.stop_reason === "refusal") throw new ClaudeRefusalError(role, msg.stop_details?.category ?? null);
  if (msg.stop_reason === "max_tokens") throw new ClaudeTruncatedError(role);
}

export function toTextResult(role: ModelRole, msg: BetaMessage): TextResult {
  if (msg.stop_reason === "refusal") throw new ClaudeRefusalError(role, msg.stop_details?.category ?? null);
  const text = msg.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const servedByFallback = (msg.usage.iterations ?? []).some((it) => it.type === "fallback_message");
  return {
    text,
    model: msg.model,
    usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
    truncated: msg.stop_reason === "max_tokens",
    servedByFallback,
  };
}
