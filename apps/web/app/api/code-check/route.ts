import { checkCode, loadEnv, YouClient } from "@studyhall/core";
import { SSE_HEADERS } from "../../../lib/answer-stream";
import { checkStream } from "../../../lib/check-stream";
import { capFromEnv, DAILY_CAP_MESSAGE, memoryDailyBudget } from "../../../lib/daily-cap";
import { clientIp, memoryRateLimiter } from "../../../lib/rate-limit";
import { redisDailyBudget, redisFromEnv, redisRateLimiter } from "../../../lib/redis";
import { searchStatusFromEnv, trackSearch } from "../../../lib/search-status";
import { CodeRequest, validationError } from "../../../lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

loadEnv();

const log = (msg: string) => console.info(`[api/code-check] ${msg}`);
// Same limits as /api/answer and /api/check, on the same Redis keys.
const redis = redisFromEnv();
const limiter = redis ? redisRateLimiter(redis, 10, 60, log) : memoryRateLimiter(10, 60_000);
const dailyCap = redis ? redisDailyBudget(redis, capFromEnv(), log) : memoryDailyBudget(capFromEnv());
const searchStatus = searchStatusFromEnv(log);

/** A code check searches the docs once per API call, so it counts as 2 questions, like a claim check. */
const CODE_CHECK_COST_IN_QUESTIONS = 2;

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
  const parsed = CodeRequest.safeParse(body);
  if (!parsed.success) return Response.json(validationError(parsed.error), { status: 400 });
  const budget = await dailyCap.take(CODE_CHECK_COST_IN_QUESTIONS);
  if (!budget.ok) {
    log(`daily cap of ${dailyCap.limit} reached`);
    return Response.json({ error: "daily_cap", message: DAILY_CAP_MESSAGE }, { status: 503, headers: { "Retry-After": String(budget.resetSec) } });
  }
  const { code, lang, release } = parsed.data;
  log(`start lines=${code.split("\n").length}${lang ? ` lang=${lang}` : ""}${release ? ` release=${release}` : ""}`);
  const stream = checkStream({
    run: (signal) => checkCode(code, { signal, you: trackSearch(new YouClient(), searchStatus), ...(lang ? { lang } : {}), ...(release ? { release } : {}) }),
    requestSignal: req.signal,
    log,
  });
  return new Response(stream, { headers: { ...SSE_HEADERS, "X-RateLimit-Remaining": String(limit.remaining) } });
}
