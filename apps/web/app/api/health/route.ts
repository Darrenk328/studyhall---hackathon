import { VERSION } from "@studyhall/core";

export const dynamic = "force-dynamic";

/** Liveness plus which credentials are configured (names only, never values). */
export function GET() {
  return Response.json({
    ok: true,
    core: VERSION,
    env: {
      YDC_API_KEY: Boolean(process.env.YDC_API_KEY),
      ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    },
  });
}
