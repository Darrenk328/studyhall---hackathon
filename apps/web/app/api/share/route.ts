import { loadEnv } from "@studyhall/core";
import { clientIp, memoryRateLimiter } from "../../../lib/rate-limit";
import { redisFromEnv, redisRateLimiter } from "../../../lib/redis";
import { passcodeOk, postToBoard, shareConfigFromEnv, sharePosts, ShareError, ShareRequest } from "../../../lib/opencrawl-share";
import { validationError } from "../../../lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

loadEnv();
const log = (msg: string) => console.info(`[api/share] ${msg}`);
const redis = redisFromEnv();
/** 5 shares a minute per IP (keys separate from questions). */
const limiter = redis ? redisRateLimiter(redis, 5, 60, log) : memoryRateLimiter(5, 60_000);

/** Whether sharing is on, and (with the passcode header) whether this browser's passcode is right. Never returns secrets. */
export async function GET(req: Request): Promise<Response> {
  const cfg = shareConfigFromEnv();
  const given = req.headers.get("x-share-passcode");
  return Response.json({ enabled: cfg.enabled, ...(given !== null ? { passcodeOk: cfg.enabled && passcodeOk(given, cfg.passcode) } : {}) });
}

export async function POST(req: Request): Promise<Response> {
  const cfg = shareConfigFromEnv();
  if (!cfg.enabled) return Response.json({ error: "disabled", message: "Sharing isn't turned on." }, { status: 404 });
  if (!passcodeOk(req.headers.get("x-share-passcode"), cfg.passcode)) return Response.json({ error: "forbidden", message: "Wrong team passcode." }, { status: 403 });
  const limit = await limiter.check(`share:${clientIp(req.headers)}`);
  if (!limit.ok) return Response.json({ error: "rate_limited", message: `Too many shares. Try again in ${limit.retryAfterSec}s.` }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json", message: "Send a JSON body." }, { status: 400 });
  }
  const parsed = ShareRequest.safeParse(body);
  if (!parsed.success) return Response.json(validationError(parsed.error), { status: 400 });
  const posts = sharePosts(parsed.data);
  try {
    const r = await postToBoard(cfg, posts);
    log(`posted ${r.posted} ${parsed.data.kind} facts`);
    return Response.json({ posted: r.posted, topic: posts[0]!.topic });
  } catch (err) {
    log(`share failed: ${err instanceof Error ? err.message : String(err)}`);
    return Response.json({ error: "share_failed", message: err instanceof ShareError ? err.message : "Couldn't reach OpenCrawl." }, { status: 502 });
  }
}
