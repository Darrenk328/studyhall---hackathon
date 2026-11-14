import type { PublicCategory } from "../lib/categories";

/** Left rail on desktop, a scrollable chip row on mobile. The URL hash is the category. */
export function CategoryRail({ categories, current }: { categories: PublicCategory[]; current: string }) {
  return (
    <nav className="rail" aria-label="Categories">
      <div className="brand">
        <a className="brand-name" href="/">
          Studyhall
        </a>
        <small>Current answers, with receipts</small>
        <a className="brand-about" href="/about">
          About
        </a>
      </div>
      <p className="rail-label">Subjects</p>
      <ul className="cat-list">
        {categories.map((c) => (
          <li key={c.id}>
            <a className="cat" href={`#${c.id}`} aria-current={c.id === current ? "page" : undefined}>
              {c.name}
            </a>
          </li>
        ))}
      </ul>
      <a className="about-link" href="/about">
        How Studyhall works
      </a>
    </nav>
  );
}
