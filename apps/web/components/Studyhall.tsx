"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicCategory } from "../lib/categories";
import { errorMessage, readSse } from "../lib/client/sse";
import { loadTurns, saveTurns } from "../lib/client/storage";
import { applyEvent, finishTurn, historyFor, newTurn, type Turn } from "../lib/client/turn";
import { CategoryIcon } from "./CategoryIcon";
import { CategoryRail } from "./CategoryRail";
import { Composer } from "./Composer";
import { ReceiptsDrawer } from "./ReceiptsDrawer";
import { TurnView } from "./TurnView";

const DEFAULT_CATEGORY = "auto";

function hashCategory(ids: Set<string>): string {
  const id = typeof window === "undefined" ? "" : decodeURIComponent(window.location.hash.slice(1)).toLowerCase();
  return ids.has(id) ? id : DEFAULT_CATEGORY;
}

/** Three starters for the empty state. Auto has none of its own, so it borrows from three categories. */
function startersFor(cat: PublicCategory, all: PublicCategory[]): string[] {
  if (cat.starters.length) return cat.starters.slice(0, 3);
  return ["health", "tech", "sports"].map((id) => all.find((c) => c.id === id)?.starters[0]).filter((s): s is string => Boolean(s));
}

export function Studyhall({ categories }: { categories: PublicCategory[] }) {
  const ids = useRef(new Set(categories.map((c) => c.id)));
  const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [running, setRunning] = useState<AbortController | null>(null);
  const [drawer, setDrawer] = useState<{ turnId: string; sourceId?: number; opener: HTMLElement | null } | null>(null);
  const [draft, setDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef(categoryId);
  categoryRef.current = categoryId;

  // Category from the URL hash (/#health), and its own session history.
  useEffect(() => {
    const sync = () => {
      const id = hashCategory(ids.current);
      setCategoryId(id);
      setTurns(loadTurns(id));
      setDrawer(null);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const category = categories.find((c) => c.id === categoryId) ?? categories[0]!;

  const updateTurn = useCallback((cat: string, id: string, fn: (t: Turn) => Turn) => {
    setTurns((prev) => {
      // A stream can finish after the user switched category: write to the category it belongs to.
      if (cat !== categoryRef.current) {
        saveTurns(cat, loadTurns(cat).map((t) => (t.id === id ? fn(t) : t)));
        return prev;
      }
      const next = prev.map((t) => (t.id === id ? fn(t) : t));
      saveTurns(cat, next);
      return next;
    });
  }, []);

  const ask = useCallback(
    async (questionRaw: string) => {
      const question = questionRaw.trim();
      if (!question || running) return;
      const cat = categoryRef.current;
      const turn = newTurn(question, cat);
      const history = historyFor(turns);
      setTurns((prev) => {
        const next = [...prev, turn];
        saveTurns(cat, next);
        return next;
      });
      setDraft("");
      const controller = new AbortController();
      setRunning(controller);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));

      try {
        const res = await fetch("/api/answer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question, category: cat, history }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const message = await errorMessage(res);
          updateTurn(cat, turn.id, (t) => finishTurn(t, "failed", message));
          return;
        }
        for await (const ev of readSse(res.body)) updateTurn(cat, turn.id, (t) => applyEvent(t, ev));
        updateTurn(cat, turn.id, (t) => finishTurn(t, "ended"));
      } catch (err) {
        const stopped = controller.signal.aborted;
        updateTurn(cat, turn.id, (t) => finishTurn(t, stopped ? "stopped" : "failed", stopped ? undefined : "The connection dropped. Please try again."));
        if (!stopped) console.error(err);
      } finally {
        setRunning(null);
        composerRef.current?.focus();
      }
    },
    [running, turns, updateTurn],
  );

  const stop = useCallback(() => running?.abort(), [running]);

  // Keep the latest turn in view while it streams, but only if the reader is already near the bottom.
  const last = turns.at(-1);
  useEffect(() => {
    if (!last || last.status !== "running") return;
    const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
    if (nearBottom) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [last?.answer.length, last?.status, last]);

  const drawerTurn = drawer ? turns.find((t) => t.id === drawer.turnId) : undefined;

  return (
    <>
      {/* Focus the box directly: following "#composer" would change the hash, which is the category. */}
      <a
        className="skip-link"
        href="#composer"
        onClick={(e) => {
          e.preventDefault();
          composerRef.current?.focus();
        }}
      >
        Skip to the question box
      </a>
      <div className="shell">
        <CategoryRail categories={categories} current={categoryId} />
        <main className="main" id="main">
          <header className="cat-header">
            <h1>
              <CategoryIcon name={category.icon} size={22} />
              {category.name}
            </h1>
            <p>{category.description}</p>
          </header>

          <div className="conversation">
            {turns.length === 0 ? (
              <section className="empty" aria-labelledby="try-heading">
                <h2 id="try-heading">Try one of these</h2>
                <div className="starters">
                  {startersFor(category, categories).map((s) => (
                    <button key={s} type="button" className="starter" onClick={() => ask(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              turns.map((t) => (
                <TurnView
                  key={t.id}
                  turn={t}
                  categories={categories}
                  onOpenReceipts={(sourceId, opener) => setDrawer({ turnId: t.id, ...(sourceId !== undefined ? { sourceId } : {}), opener })}
                />
              ))
            )}
            <div ref={bottomRef} />
          </div>

          <Composer ref={composerRef} value={draft} onChange={setDraft} onAsk={() => ask(draft)} onStop={stop} running={Boolean(running)} categoryName={category.name} />
        </main>
      </div>

      {drawer && drawerTurn && (
        <ReceiptsDrawer
          turn={drawerTurn}
          targetSourceId={drawer.sourceId}
          onClose={() => {
            const opener = drawer.opener;
            setDrawer(null);
            requestAnimationFrame(() => opener?.focus());
          }}
        />
      )}
    </>
  );
}
