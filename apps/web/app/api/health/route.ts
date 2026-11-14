import { loadEnv, VERSION } from "@studyhall/core";
import { capFromEnv } from "../../../lib/daily-cap";
import { redisFromEnv } from "../../../lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same env source as /api/answer: the repo-root .env locally, project settings on Vercel.
loadEnv();

/**
 * Liveness plus which credentials are configured (names only, never values). Locally, Anthropic
 * calls can also use an `ant auth login` profile, so ANTHROPIC_API_KEY may be false and still work.
 */
export function GET() {
  return Response.json({
    ok: true,
    core: VERSION,
    env: {
      YDC_API_KEY: Boolean(process.env.YDC_API_KEY),
      ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    },
    limits: { store: redisFromEnv() ? "upstash-redis" : "memory", perIpPerMinute: 10, dailyCap: capFromEnv() },
  });
}
