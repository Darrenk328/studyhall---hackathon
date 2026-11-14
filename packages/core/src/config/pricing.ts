/**
 * List prices used to estimate cost per question (evals). Claude prices are Anthropic's
 * first-party API rates; You.com prices are from third-party summaries of its usage-based pricing
 * (see DECISIONS.md) and should be treated as estimates.
 */
export const CLAUDE_PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

export const YOU_PRICE = {
  /** Per search call. */
  search: 5 / 1000,
  /** Per page read with the Contents API. */
  contentsPage: 1 / 1000,
  /** Per Research API call, by effort. */
  research: { lite: 12 / 1000, standard: 50 / 1000, deep: 100 / 1000 } as Record<string, number>,
};

export function claudeCost(calls: { model: string; inputTokens: number; outputTokens: number }[]): number {
  return calls.reduce((sum, c) => {
    const p = CLAUDE_PRICE_PER_MTOK[c.model] ?? CLAUDE_PRICE_PER_MTOK["claude-sonnet-5-5"]!;
    return sum + (c.inputTokens * p.input + c.outputTokens * p.output) / 1_000_000;
  }, 0);
}

export function youCost(u: { searches: number; contentsPages: number }): number {
  return u.searches * YOU_PRICE.search + u.contentsPages * YOU_PRICE.contentsPage;
}
