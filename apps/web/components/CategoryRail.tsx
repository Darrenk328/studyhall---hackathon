import type { PublicCategory } from "../lib/categories";

/** Left rail on desktop, a scrollable chip row on mobile. The URL hash is the category. */
export function CategoryRail({ categories, current }: { categories: PublicCategory[]; current: string }) {
  return (
    <nav className="rail" aria-label="Categories">
      <div className="brand">
        <span>Studyhall</span>
        <small>Current answers, with receipts</small>
      </div>
      <ul className="cat-list">
        {categories.map((c) => (
          <li key={c.id}>
            <a className="cat" href={`#${c.id}`} aria-current={c.id === current ? "page" : undefined}>
              <span className="emoji" aria-hidden="true">
                {c.emoji}
              </span>
              {c.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
