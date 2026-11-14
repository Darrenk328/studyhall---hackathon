"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicCategory } from "../lib/categories";
import { DEMO_URL, demoSpeed, findRecording, isDemoMode, replay, type DemoRecording, type DemoSet } from "../lib/client/demo";
import { errorMessage, readSse } from "../lib/client/sse";
import { loadApp, loadCompare, loadTurns, saveApp, saveCompare, saveTurns } from "../lib/client/storage";
import { applyEvent, finishTurn, historyFor, newTurn, type Turn } from "../lib/client/turn";
import { AppChips } from "./AppChips";
import { CategoryRail } from "./CategoryRail";
import { CategoryIcon } from "./CategoryIcon";
import { Composer } from "./Composer";
import { Logo } from "./Logo";
import { ReceiptsDrawer } from "./ReceiptsDrawer";
import { TurnView } from "./TurnView";

const DEFAULT_CATEGORY = "auto";

/** Home-page headlines: plain text, then the part drawn in the rainbow gradient. One is picked at random per visit. */
const GREETINGS: [string, string][] = [
  ["Answers from today's web,", "with receipts."],
  ["What do you want", "checked today?"],
  ["Don't guess.", "Check it live."],
  ["Ask about today.", "We'll show our sources."],
  ["Fresh facts,", "every claim cited."],
  ["What changed since", "the model was trained?"],
  ["Ask anything current.", "Get the receipts."],
  ["Where should we", "start looking?"],
];

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
  const [app, setApp] = useState<string | undefined>(undefined);
  const [compare, setCompare] = useState(false);
  useEffect(() => setCompare(loadCompare()), []);
  const toggleCompare = () =>
    setCompare((c) => {
      saveCompare(!c);
      return !c;
    });
  // Demo replay (/?demo=1): recorded answers for the demo questions; anything else runs live.
  const [demo, setDemo] = useState<DemoSet | null>(null);
  // The demo questions fold away once a question is asked, so the answer gets the screen.
  const [demoOpen, setDemoOpen] = useState(true);
  // The server renders the first greeting; the browser swaps in a random one on each load and each new subject.
  const [greeting, setGreeting] = useState(0);
  const speed = useRef(1);
  const pendingDemo = useRef<DemoRecording | null>(null);
  useEffect(() => {
    if (!isDemoMode(window.location.search)) return;
    speed.current = demoSpeed(window.location.search);
    fetch(DEMO_URL)
      .then((r) => (r.ok ? (r.json() as Promise<DemoSet>) : null))
      .then((d) => setDemo(d && Array.isArray(d.items) ? d : { recordedAt: "", items: [] }))
      .catch(() => setDemo({ recordedAt: "", items: [] }));
  }, []);
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
      setApp(loadApp(id));
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    setGreeting((g) => (g + 1 + Math.floor(Math.random() * (GREETINGS.length - 1))) % GREETINGS.length);
  }, [categoryId]);

  const category = categories.find((c) => c.id === categoryId) ?? categories[0]!;
  const selectedApp = category.apps?.find((a) => a.id === app);
  const pickApp = (id?: string) => {
    setApp(id);
    saveApp(categoryRef.current, id);
  };

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
    async (questionRaw: string, recording?: DemoRecording) => {
      const question = questionRaw.trim();
      if (!question || running) return;
      const cat = categoryRef.current;
      const found = findRecording(demo, question);
      const rec = recording ?? (found && found.category === cat ? found : undefined);
      const useCompare = rec ? Boolean(rec.compare) : compare;
      const useApp = rec ? category.apps?.find((a) => a.id === rec.app) : selectedApp;
      const turn = { ...newTurn(question, cat, undefined, useApp, useCompare), ...(rec ? { replayOf: rec.recordedAt } : {}) };
      const history = historyFor(turns);
      setTurns((prev) => {
        const next = [...prev, turn];
        saveTurns(cat, next);
        return next;
      });
      setDraft("");
      setDemoOpen(false);
      const controller = new AbortController();
      setRunning(controller);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));

      try {
        if (rec) {
          for await (const ev of replay(rec, controller.signal, speed.current)) updateTurn(cat, turn.id, (t) => applyEvent(t, ev));
          updateTurn(cat, turn.id, (t) => finishTurn(t, "ended"));
          return;
        }
        const res = await fetch("/api/answer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question, category: cat, history, ...(selectedApp ? { app: selectedApp.id } : {}), ...(compare ? { compare: true } : {}) }),
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
    [running, turns, updateTurn, selectedApp, compare, demo, category],
  );

  /** A demo question: switch to its category (and app, and compare setting) first, then replay it. */
  const askDemo = (rec: DemoRecording) => {
    if (running) return;
    setCompare(Boolean(rec.compare));
    if (rec.category !== categoryRef.current) {
      pendingDemo.current = rec;
      window.location.hash = rec.category;
      return;
    }
    if (rec.app) pickApp(rec.app);
    void ask(rec.question, rec);
  };
  useEffect(() => {
    const rec = pendingDemo.current;
    if (!rec || rec.category !== categoryId) return;
    pendingDemo.current = null;
    if (rec.app) pickApp(rec.app);
    void ask(rec.question, rec);
  }, [categoryId, ask]);

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
          {demo && (
            <section className="demo-bar" aria-labelledby="demo-heading">
              <div className="demo-head">
                <p id="demo-heading">
                  <strong>Demo mode</strong> · {demo.items.length} answers recorded live
                  {demo.recordedAt ? ` on ${new Date(demo.recordedAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })}` : ""}, replayed with their real
                  timing and receipts. Anything else you ask runs live.
                </p>
                {!demoOpen && (
                  <button type="button" className="link-button" aria-expanded={false} aria-controls="demo-questions" onClick={() => setDemoOpen(true)}>
                    Show demo questions
                  </button>
                )}
              </div>
              {demoOpen && (
                <div className="demo-questions" id="demo-questions">
                  {demo.items.map((r) => (
                    <button key={r.question} type="button" className="starter" onClick={() => askDemo(r)} disabled={Boolean(running)}>
                      {r.question}
                      {r.compare ? <span className="app-tag">Compare</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
          <header className="cat-header">
            <h1>
              <CategoryIcon name={category.icon} size={19} />
              {category.name}
            </h1>
            <p>{category.description}</p>
          </header>

          <div className="conversation">
            {turns.length === 0 ? (
              <section className="empty" aria-labelledby="try-heading">
                <div className="hero">
                  <Logo size={52} />
                  <p className="hero-title">
                    {GREETINGS[greeting]![0]} <span className="rainbow-text">{GREETINGS[greeting]![1]}</span>
                  </p>
                  <p className="hero-lead">
                    Ask about anything that changes: fees, versions, rules, records. Studyhall searches the live web with You.com, reads the pages, checks every claim
                    against its source, and shows what the same model would have guessed without them.
                  </p>
                  <ol className="how">
                    <li>
                      <strong>Search</strong> the live web
                    </li>
                    <li>
                      <strong>Read</strong> the best pages
                    </li>
                    <li>
                      <strong>Check</strong> every claim
                    </li>
                    <li>
                      <strong>Show</strong> the receipts
                    </li>
                  </ol>
                </div>
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

          {category.apps && <AppChips apps={category.apps} selected={app} onSelect={pickApp} />}
          <Composer
            ref={composerRef}
            value={draft}
            onChange={setDraft}
            onAsk={() => ask(draft)}
            onStop={stop}
            running={Boolean(running)}
            categoryName={category.name}
            compare={compare}
            onToggleCompare={toggleCompare}
          />
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
