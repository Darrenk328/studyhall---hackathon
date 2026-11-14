import { answer, loadEnv } from "@studyhall/core";
import { answerStream, SSE_HEADERS } from "../../../lib/answer-stream";
import { capFromEnv, DAILY_CAP_MESSAGE, DailyCap } from "../../../lib/daily-cap";
import { clientIp, SlidingWindowLimiter } from "../../../lib/rate-limit";
import { AnswerRequest, validationError } from "../../../lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Slowest answer in the 36-question run was ~30s; leave headroom for a repair pass on a slow day. */
export const maxDuration = 90;

// Local dev reads the repo-root .env; on Vercel the variables come from the project settings.
loadEnv();

const limiter = new SlidingWindowLimiter(10, 60_000);
/** Global cost guard on top of the per-IP limit (env DAILY_QUESTION_CAP, default 500). */
const dailyCap = new DailyCap(capFromEnv());
const log = (msg: string) => console.info(`[api/answer] ${msg}`);

export async function POST(req: Request): Promise<Response> {
  const limit = limiter.check(clientIp(req.headers));
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
  const budget = dailyCap.take();
  if (!budget.ok) {
    log(`daily cap of ${dailyCap.limit} reached`);
    return Response.json({ error: "daily_cap", message: DAILY_CAP_MESSAGE }, { status: 503, headers: { "Retry-After": String(budget.resetSec) } });
  }

  const { question, category, history } = parsed.data;
  log(`start category=${category} chars=${question.length} history=${history.length}`);
  const stream = answerStream({ question, category, history, run: answer, requestSignal: req.signal, log });
  return new Response(stream, { headers: { ...SSE_HEADERS, "X-RateLimit-Remaining": String(limit.remaining) } });
}
