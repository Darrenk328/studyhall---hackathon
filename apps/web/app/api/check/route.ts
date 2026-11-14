import { CHECK_COST_IN_QUESTIONS, checkClaims, loadEnv, YouClient } from "@studyhall/core";
import { SSE_HEADERS } from "../../../lib/answer-stream";
import { checkStream } from "../../../lib/check-stream";
import { capFromEnv, DAILY_CAP_MESSAGE, memoryDailyBudget } from "../../../lib/daily-cap";
import { clientIp, memoryRateLimiter } from "../../../lib/rate-limit";
import { redisDailyBudget, redisFromEnv, redisRateLimiter } from "../../../lib/redis";
import { searchStatusFromEnv, trackSearch } from "../../../lib/search-status";
import { CheckRequest, validationError } from "../../../lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Claims are checked in parallel; a check of 8 claims should finish well inside this. */
export const maxDuration = 90;

loadEnv();

const log = (msg: string) => console.info(`[api/check] ${msg}`);
// Same limits as /api/answer, on the same Redis keys: the per-IP limit and daily cap are shared.
const redis = redisFromEnv();
const limiter = redis ? redisRateLimiter(redis, 10, 60, log) : memoryRateLimiter(10, 60_000);
const dailyCap = redis ? redisDailyBudget(redis, capFromEnv(), log) : memoryDailyBudget(capFromEnv());
const searchStatus = searchStatusFromEnv(log);

export async function POST(req: Request): Promise<Response> {
  const limit = await limiter.check(clientIp(req.headers));
  if (!limit.ok) {
    return Response.json(
      { error: "rate_limited", message: `Too many requests. Try again in ${limit.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json", message: "Send a JSON body." }, { status: 400 });
  }
  const parsed = CheckRequest.safeParse(body);
  if (!parsed.success) return Response.json(validationError(parsed.error), { status: 400 });

  // A check runs several searches per claim, so it counts as 2 questions.
  const budget = await dailyCap.take(CHECK_COST_IN_QUESTIONS);
  if (!budget.ok) {
    log(`daily cap of ${dailyCap.limit} reached`);
    return Response.json({ error: "daily_cap", message: DAILY_CAP_MESSAGE }, { status: 503, headers: { "Retry-After": String(budget.resetSec) } });
  }

  const { text } = parsed.data;
  log(`start chars=${text.length}`);
  const stream = checkStream({
    // Every You.com call is tracked: a 402 marks search out of credit, a success clears it.
    run: (signal) => checkClaims(text, { signal, you: trackSearch(new YouClient(), searchStatus) }),
    requestSignal: req.signal,
    log,
  });
  return new Response(stream, { headers: { ...SSE_HEADERS, "X-RateLimit-Remaining": String(limit.remaining) } });
}
