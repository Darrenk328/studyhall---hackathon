import { ShieldCheck } from "lucide-react";
import type { PublicCategory } from "../lib/categories";
import { CategoryIcon } from "./CategoryIcon";

/** Left rail on desktop, a scrollable chip row on mobile. The URL hash is the category. */
export function CategoryRail({ categories, current }: { categories: PublicCategory[]; current: string }) {
  return (
    <nav className="rail" aria-label="Categories">
      <div className="brand">
        <span>Studyhall</span>
        <small>Answers with receipts</small>
        <a className="brand-about" href="/about">
          About
        </a>
      </div>
      <ul className="cat-list">
        <li>
          <a className="cat cat-check" href="#check" aria-current={current === "check" ? "page" : undefined}>
            <ShieldCheck size={18} strokeWidth={1.75} aria-hidden="true" focusable="false" className="cat-icon" />
            Check a claim
          </a>
        </li>
        <li className="cat-divider" aria-hidden="true" />
        {categories.map((c) => (
          <li key={c.id}>
            <a className="cat" href={`#${c.id}`} aria-current={c.id === current ? "page" : undefined}>
              <CategoryIcon name={c.icon} />
              {c.name}
            </a>
          </li>
        ))}
      </ul>
      <a className="about-link" href="/about">
        About Studyhall
      </a>
    </nav>
  );
}
