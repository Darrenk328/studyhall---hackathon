import { answer, loadEnv } from "@studyhall/core";
import { answerStream, SSE_HEADERS } from "../../../lib/answer-stream";
import { clientIp, SlidingWindowLimiter } from "../../../lib/rate-limit";
import { AnswerRequest, validationError } from "../../../lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Slowest answer in the 36-question run was ~30s; leave headroom for a repair pass on a slow day. */
export const maxDuration = 90;

// Local dev reads the repo-root .env; on Vercel the variables come from the project settings.
loadEnv();

const limiter = new SlidingWindowLimiter(10, 60_000);
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

  const { question, category, history } = parsed.data;
  log(`start category=${category} chars=${question.length} history=${history.length}`);
  const stream = answerStream({ question, category, history, run: answer, requestSignal: req.signal, log });
  return new Response(stream, { headers: { ...SSE_HEADERS, "X-RateLimit-Remaining": String(limit.remaining) } });
}
