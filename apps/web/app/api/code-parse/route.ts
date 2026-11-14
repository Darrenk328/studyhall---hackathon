import { CODE_APPS, detectLanguage, parseApiCalls } from "@studyhall/core";
import { clientIp, memoryRateLimiter } from "../../../lib/rate-limit";
import { CodeRequest, validationError } from "../../../lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Listing the calls is local pattern matching (no model, no search), so it's cheap; it still gets a generous per-IP limit. */
const limiter = memoryRateLimiter(120, 60_000);

export async function POST(req: Request): Promise<Response> {
  const limit = await limiter.check(clientIp(req.headers));
  if (!limit.ok) return Response.json({ error: "rate_limited", message: "Too many requests." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json", message: "Send a JSON body." }, { status: 400 });
  }
  const parsed = CodeRequest.safeParse(body);
  if (!parsed.success) return Response.json(validationError(parsed.error), { status: 400 });
  const lang = parsed.data.lang ?? detectLanguage(parsed.data.code);
  return Response.json({ lang, detected: !parsed.data.lang, app: CODE_APPS[lang].name, calls: parseApiCalls(parsed.data.code, lang) });
}
