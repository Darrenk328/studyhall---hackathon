/**
 * Global daily cap on answered questions, so a shared demo link can't drain the API credits.
 * Resets at UTC midnight. In memory, so it is per server instance (see DECISIONS.md).
 */
export const DEFAULT_DAILY_CAP = 500;

export function capFromEnv(value: string | undefined = process.env.DAILY_QUESTION_CAP): number {
  const n = Number(value);
  return value !== undefined && value.trim() !== "" && Number.isInteger(n) && n >= 0 ? n : DEFAULT_DAILY_CAP;
}

export type DailyCapResult = { ok: true; remaining: number } | { ok: false; resetSec: number };

/** What the route needs from the daily cap. The in-memory one below; Upstash Redis at deploy (DECISIONS.md). */
export interface DailyBudget {
  readonly limit: number;
  take(): Promise<DailyCapResult>;
}

export function memoryDailyBudget(limit: number): DailyBudget {
  const cap = new DailyCap(limit);
  return { limit, take: async () => cap.take() };
}

export class DailyCap {
  private day = "";
  private used = 0;

  constructor(
    readonly limit: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Spend one question from today's budget, or say when the budget resets. */
  take(): DailyCapResult {
    const now = this.now();
    const today = now.toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.used = 0;
    }
    if (this.used >= this.limit) {
      const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      return { ok: false, resetSec: Math.max(1, Math.ceil((midnight - now.getTime()) / 1000)) };
    }
    this.used++;
    return { ok: true, remaining: this.limit - this.used };
  }
}

export const DAILY_CAP_MESSAGE =
  "Studyhall has answered as many questions as it can today. The limit resets at midnight UTC, so please come back then.";
