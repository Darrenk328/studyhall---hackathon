import { publicCategories } from "../../../lib/categories";

export const dynamic = "force-static";

/** Public category fields only: no personas, prompts, safety text or domain lists. */
export function GET(): Response {
  return Response.json({ categories: publicCategories() }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
