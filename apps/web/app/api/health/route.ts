import { loadEnv, VERSION } from "@studyhall/core";
import { capFromEnv } from "../../../lib/daily-cap";
import { redisFromEnv } from "../../../lib/redis";
import { searchStatusFromEnv } from "../../../lib/search-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same env source as /api/answer: the repo-root .env locally, project settings on Vercel.
loadEnv();

const searchStatus = searchStatusFromEnv();

/**
 * Liveness plus which credentials are configured (names only, never values). Locally, Anthropic
 * calls can also use an `ant auth login` profile, so ANTHROPIC_API_KEY may be false and still work.
 * `search` is what real questions last saw from You.com: "ok", "out_of_credit" (HTTP 402) or
 * "unknown" (no question since the status expired). Checking it costs no API calls.
 */
export async function GET() {
  const search = await searchStatus.get();
  return Response.json({
    ok: true,
    core: VERSION,
    env: {
      YDC_API_KEY: Boolean(process.env.YDC_API_KEY),
      ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    },
    search: search.status,
    ...(search.at ? { searchCheckedAt: search.at } : {}),
    limits: { store: redisFromEnv() ? "upstash-redis" : "memory", perIpPerMinute: 10, dailyCap: capFromEnv() },
  });
}
