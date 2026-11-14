"use client";

import { forwardRef, useLayoutEffect, useRef } from "react";

const MAX = 1000;

interface Props {
  value: string;
  onChange: (v: string) => void;
  onAsk: () => void;
  onStop: () => void;
  running: boolean;
  categoryName: string;
  compare: boolean;
  onToggleCompare: () => void;
}

/** Auto-growing textarea. Enter sends, Shift+Enter adds a line. Ask becomes Stop while answering. */
export const Composer = forwardRef<HTMLTextAreaElement, Props>(function Composer({ value, onChange, onAsk, onStop, running, categoryName, compare, onToggleCompare }, ref) {
  const inner = useRef<HTMLTextAreaElement | null>(null);

  // Grow with the text (up to 200px). An empty box keeps its natural one-row height, so a measurement
  // taken before styles settle can't leave it stuck tall.
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "";
      if (el.value) el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [value]);

  const canAsk = value.trim().length > 0 && !running;

  return (
    <div className="composer-wrap">
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (running) onStop();
          else if (canAsk) onAsk();
        }}
      >
        <label htmlFor="composer" className="sr-only">
          Ask about {categoryName.toLowerCase()}
        </label>
        <textarea
          id="composer"
          ref={(el) => {
            inner.current = el;
            if (typeof ref === "function") ref(el);
            else if (ref) ref.current = el;
          }}
          rows={1}
          maxLength={MAX}
          value={value}
          placeholder={categoryName === "Auto" ? "Ask about anything current…" : `Ask about ${categoryName.toLowerCase()}…`}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canAsk) onAsk();
            }
          }}
          aria-describedby="composer-hint"
        />
        {running ? (
          <button type="submit" className="ask stop">
            Stop
          </button>
        ) : (
          <button type="submit" className="ask" disabled={!canAsk}>
            Ask
          </button>
        )}
      </form>
      <div className="composer-meta">
        <span id="composer-hint">Enter to ask, Shift+Enter for a new line.</span>
        <button type="button" role="switch" aria-checked={compare} className="switch" onClick={onToggleCompare} disabled={running}>
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          Compare with no search
        </button>
        {value.length > MAX * 0.8 && (
          <span aria-live="polite">
            {value.length} / {MAX}
          </span>
        )}
      </div>
    </div>
  );
});
