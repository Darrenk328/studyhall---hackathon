"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import type { PublicCategory } from "../lib/categories";
import { CHECK_ID, FEATURED_IDS } from "../lib/flagships";
import { CategoryIcon } from "./CategoryIcon";
import { Logo } from "./Logo";

/**
 * The top bar: brand, a "How it works" panel that drops down in place, and the subjects as one
 * scrollable row of chips. The URL hash is the category.
 */
export function CategoryRail({ categories, current }: { categories: PublicCategory[]; current: string }) {
  const [howOpen, setHowOpen] = useState(false);
  // Featured: Check a claim and the four flagship fields. Everything else is behind "More topics".
  const featured = FEATURED_IDS.map((id) => categories.find((c) => c.id === id)).filter((c): c is PublicCategory => Boolean(c));
  const more = categories.filter((c) => !FEATURED_IDS.includes(c.id));
  const inMore = more.some((c) => c.id === current);
  const [moreOpen, setMoreOpen] = useState(inMore);
  useEffect(() => {
    if (inMore) setMoreOpen(true);
  }, [inMore]);
  const chip = (c: PublicCategory) => (
    <li key={c.id}>
      <a className="cat" href={`#${c.id}`} aria-current={c.id === current ? "page" : undefined}>
        <CategoryIcon name={c.icon} />
        {c.name}
      </a>
    </li>
  );
  // Close the panel when the subject changes or Escape is pressed.
  useEffect(() => setHowOpen(false), [current]);
  useEffect(() => {
    if (!howOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setHowOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [howOpen]);

  // Arrows and edge fades show only when the subject row can scroll further that way.
  const listRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, moreOpen]);
  // Bring the current subject into view, e.g. after a demo question switches to it.
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);
  const scrollBy = (dir: 1 | -1) => listRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });

  return (
    <header className="rail">
      <div className="topbar-row">
        <a className="brand-name" href="/" aria-current={current === "home" ? "page" : undefined}>
          <Logo size={24} />
          Studyhall
        </a>
        <span className="brand-tag">Answers with receipts</span>
        <button type="button" className="how-toggle" aria-expanded={howOpen} aria-controls="how-panel" onClick={() => setHowOpen((o) => !o)}>
          How it works
          <ChevronDown size={15} aria-hidden="true" focusable="false" />
        </button>
      </div>
      <nav aria-label="Categories" className={`cat-scroll${edges.left ? " more-left" : ""}${edges.right ? " more-right" : ""}`}>
        {edges.left && (
          <button type="button" className="scroll-btn scroll-left" aria-label="Scroll subjects left" onClick={() => scrollBy(-1)}>
            <ChevronLeft size={16} aria-hidden="true" focusable="false" />
          </button>
        )}
        {edges.right && (
          <button type="button" className="scroll-btn scroll-right" aria-label="Scroll subjects right" onClick={() => scrollBy(1)}>
            <ChevronRight size={16} aria-hidden="true" focusable="false" />
          </button>
        )}
        <ul className="cat-list" ref={listRef} onScroll={measure}>
          <li>
            <a className="cat cat-check" href={`#${CHECK_ID}`} aria-current={current === CHECK_ID ? "page" : undefined}>
              <span className="cat-icon" aria-hidden="true">
                <ShieldCheck size={15} strokeWidth={2} focusable="false" />
              </span>
              Check a claim
            </a>
          </li>
          {featured.map(chip)}
          <li className="cat-divider" aria-hidden="true" />
          <li>
            <button type="button" className="cat more-toggle" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
              More topics
              <ChevronDown size={14} aria-hidden="true" focusable="false" className="more-chev" />
            </button>
          </li>
          {moreOpen && more.map(chip)}
        </ul>
      </nav>
      {howOpen && <HowItWorks />}
    </header>
  );
}

const STEPS: [string, string][] = [
  ["Plan", "Turns your question into a few targeted searches."],
  ["Search", "You.com Search finds fresh pages, favoring official sources."],
  ["Read", "You.com Contents pulls the full text of the best pages."],
  ["Write & check", "Claude answers with citations, checks every claim against its source, and rewrites weak sentences."],
  ["Receipts", "Sources, dates, a verdict per claim and a confidence level for every answer."],
];

function HowItWorks() {
  return (
    <section className="how-panel" id="how-panel" aria-label="How Studyhall works">
      <ol className="how-steps">
        {STEPS.map(([title, text], i) => (
          <li key={title}>
            <span className="how-num">{i + 1}</span>
            <strong>{title}</strong>
            <p>{text}</p>
          </li>
        ))}
      </ol>
      <div className="how-extras">
        <p>
          <strong>Compare mode</strong> runs the same model with no search, side by side, so you can see what it would have guessed.
        </p>
        <p>
          <strong>Check a claim</strong> takes any text, such as another AI&apos;s answer, and gives each claim a verdict with sources.
        </p>
        <p>
          <strong>Accuracy</strong> on our 65-question eval: 92% correct, against 46% for the same model from memory. The You.com Research API scored 94%.
        </p>
      </div>
    </section>
  );
}
