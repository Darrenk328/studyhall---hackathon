import type { PublicCategory } from "../lib/categories";

/** Optional app picker for categories with apps. Toggle buttons; pressing the selected one clears it. */
export function AppChips({ apps, selected, onSelect }: { apps: NonNullable<PublicCategory["apps"]>; selected?: string; onSelect: (id?: string) => void }) {
  return (
    <div className="app-chips" role="group" aria-label="App (optional)">
      <span className="app-chips-label" aria-hidden="true">
        App
      </span>
      {apps.map((a) => {
        const on = a.id === selected;
        return (
          <button key={a.id} type="button" className="app-chip" aria-pressed={on} title={on ? `Asking about ${a.name}. Press again to clear.` : `Ask about ${a.name}`} onClick={() => onSelect(on ? undefined : a.id)}>
            {a.label}
          </button>
        );
      })}
    </div>
  );
}
