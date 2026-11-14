import { AUTO_CATEGORY, CATEGORIES } from "@studyhall/core";

export interface PublicCategory {
  id: string;
  name: string;
  /** Lucide icon name, e.g. "stethoscope". */
  icon: string;
  description: string;
  starters: string[];
}

/** `auto` first, then the 12 categories in display order. */
export function publicCategories(): PublicCategory[] {
  return [
    { id: AUTO_CATEGORY.id, name: AUTO_CATEGORY.name, icon: AUTO_CATEGORY.icon, description: AUTO_CATEGORY.description, starters: [] },
    ...CATEGORIES.map(({ id, name, icon, description, starters }) => ({ id, name, icon, description, starters: [...starters] })),
  ];
}
