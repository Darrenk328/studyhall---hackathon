import { answer, ClaudeClient, getCategory, loadEnv, memoryAnswer, whereTheyDiffer, type Category } from "@studyhall/core";
import { answerStream, SSE_HEADERS } from "../../../lib/answer-stream";
import { capFromEnv, DAILY_CAP_MESSAGE, memoryDailyBudget } from "../../../lib/daily-cap";
import { clientIp, memoryRateLimiter } from "../../../lib/rate-limit";
import { AnswerRequest, validationError } from "../../../lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Slowest answer in the 36-question run was ~30s; leave headroom for a repair pass on a slow day. */
export const maxDuration = 90;

// Local dev reads the repo-root .env; on Vercel the variables come from the project settings.
loadEnv();

// Per-instance stores for now; swap for the Upstash Redis versions at deploy (DECISIONS.md, Phase 7 prep).
const limiter = memoryRateLimiter(10, 60_000);
/** Global cost guard on top of the per-IP limit (env DAILY_QUESTION_CAP, default 500). */
const dailyCap = memoryDailyBudget(capFromEnv());
const log = (msg: string) => console.info(`[api/answer] ${msg}`);

/** For "auto", the memory answer starts before a category is picked, so it gets a neutral persona. */
const NEUTRAL = { persona: "You are a knowledgeable, careful assistant." } as Category;

export async function POST(req: Request): Promise<Response> {
  const limit = await limiter.check(clientIp(req.headers));
  if (!limit.ok) {
    return Response.json(
      { error: "rate_limited", message: `Too many questions. Try again in ${limit.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json", message: "Send a JSON body." }, { status: 400 });
  }
  const parsed = AnswerRequest.safeParse(body);
  if (!parsed.success) return Response.json(validationError(parsed.error), { status: 400 });

  // Only valid questions spend the daily budget.
  const budget = await dailyCap.take();
  if (!budget.ok) {
    log(`daily cap of ${dailyCap.limit} reached`);
    return Response.json({ error: "daily_cap", message: DAILY_CAP_MESSAGE }, { status: 503, headers: { "Retry-After": String(budget.resetSec) } });
  }

  const { question, category, history, app, compare } = parsed.data;
  log(`start category=${category}${app ? ` app=${app}` : ""}${compare ? " compare" : ""} chars=${question.length} history=${history.length}`);
  const claude = compare ? new ClaudeClient() : undefined;
  const cat = getCategory(category) ?? NEUTRAL;
  const stream = answerStream({
    question,
    category,
    history,
    ...(app ? { app } : {}),
    run: answer,
    requestSignal: req.signal,
    log,
    ...(claude
      ? {
          compare: true,
          memory: (signal: AbortSignal) => memoryAnswer(claude, question, cat, new Date(), signal),
          differ: (memoryText: string, receipts: Parameters<typeof whereTheyDiffer>[3], signal: AbortSignal) => whereTheyDiffer(claude, question, memoryText, receipts, signal),
        }
      : {}),
  });
  return new Response(stream, { headers: { ...SSE_HEADERS, "X-RateLimit-Remaining": String(limit.remaining) } });
}
