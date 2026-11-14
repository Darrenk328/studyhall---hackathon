"use client";

import { ShieldCheck } from "lucide-react";
import type { PublicCategory } from "../lib/categories";
import { CHECK_EXAMPLES, FLAGSHIPS } from "../lib/flagships";
import { CategoryIcon } from "./CategoryIcon";
import { Logo } from "./Logo";

/**
 * The home page: what Studyhall is in one line, the four flagship verticals with two example
 * questions each, and Check a claim. Everything here is one click from a live, cited answer.
 */
export function HomeView({
  categories,
  onAsk,
  onCheck,
}: {
  categories: PublicCategory[];
  /** Go to a category (optionally with an app chip) and ask this question. */
  onAsk: (categoryId: string, question: string, app?: string) => void;
  /** Go to Check a claim and check this text. */
  onCheck: (text: string) => void;
}) {
  const cat = (id: string) => categories.find((c) => c.id === id);
  return (
    <div className="home">
      <header className="home-hero">
        <Logo size={44} />
        <h1>Live, cited answers for fields where outdated info is expensive: engineering, health, law and business.</h1>
        <p>
          Studyhall searches the live web, answers only from what it read, and checks every claim against its source. Paste another AI&apos;s answer and it checks
          that too.
        </p>
      </header>

      <section className="flagships" aria-label="Featured topics">
        {FLAGSHIPS.map((f) => {
          const c = cat(f.id);
          if (!c) return null;
          return (
            <article key={f.id} className="flagship" aria-labelledby={`flag-${f.id}`}>
              <h2 id={`flag-${f.id}`}>
                <a href={`#${f.id}`}>
                  <CategoryIcon name={c.icon} size={20} />
                  {c.name}
                </a>
              </h2>
              <p className="flagship-why">{f.why}</p>
              {c.apps && (
                <div className="flagship-apps" aria-label={`${c.name} apps`}>
                  {c.apps.slice(0, 4).map((a) => (
                    <a key={a.id} className="app-tag" href={`#${f.id}`}>
                      {a.label}
                    </a>
                  ))}
                </div>
              )}
              <div className="flagship-examples">
                {f.examples.map((q) => (
                  <button key={q} type="button" className="starter" onClick={() => onAsk(f.id, q)}>
                    {q}
                  </button>
                ))}
              </div>
              {f.note && <p className="safety-note">{f.note}</p>}
            </article>
          );
        })}
      </section>

      <section className="flagship flagship-check" aria-labelledby="flag-check">
        <h2 id="flag-check">
          <a href="#check">
            <ShieldCheck size={20} strokeWidth={1.75} aria-hidden="true" focusable="false" className="cat-icon" />
            Check a claim
          </a>
        </h2>
        <p className="flagship-why">
          Paste a claim or another AI&apos;s answer. Each fact comes back supported, contradicted or unverifiable, with the sources. It works on news from this
          week, which no model was trained on.
        </p>
        <div className="flagship-examples check-examples">
          {CHECK_EXAMPLES.map((ex) => (
            <button key={ex.text} type="button" className={`starter${ex.vertical === "Business" ? " example-optional" : ""}`} onClick={() => onCheck(ex.text)}>
              <span className="example-vertical">{ex.vertical}</span> {ex.label}
            </button>
          ))}
        </div>
      </section>

      <p className="home-more">
        Other topics (tech, science, travel, finance and more) are under <strong>More topics</strong>, or ask about anything in <a href="#auto">Auto</a>.
      </p>
    </div>
  );
}
