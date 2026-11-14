import type { PublicCategory } from "../lib/categories";
import { CategoryIcon } from "./CategoryIcon";

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
              <CategoryIcon name={c.icon} />
              {c.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
