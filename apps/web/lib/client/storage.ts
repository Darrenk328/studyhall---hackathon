import type { Turn } from "./turn";

const key = (categoryId: string) => `studyhall:turns:${categoryId}`;
const MAX_TURNS = 20;

/** Each category keeps its own history for this browser tab (sessionStorage). */
export function loadTurns(categoryId: string): Turn[] {
  try {
    const raw = sessionStorage.getItem(key(categoryId));
    if (!raw) return [];
    const turns = JSON.parse(raw) as Turn[];
    // A turn saved mid-stream can't resume; show it as interrupted.
    return turns.map((t) =>
      t.status === "running"
        ? { ...t, status: "failed", phase: "finished", statusText: "Interrupted.", ...(t.answer ? { unverified: "This answer was interrupted before it was checked." } : { error: "This question was interrupted." }) }
        : t,
    );
  } catch {
    return [];
  }
}

export function saveTurns(categoryId: string, turns: Turn[]): void {
  try {
    sessionStorage.setItem(key(categoryId), JSON.stringify(turns.slice(-MAX_TURNS)));
  } catch {
    // Storage full or unavailable: history just won't persist.
  }
}
