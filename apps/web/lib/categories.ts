import { AUTO_CATEGORY, CATEGORIES } from "@studyhall/core";

export interface PublicCategory {
  id: string;
  name: string;
  emoji: string;
  description: string;
  starters: string[];
}

/** `auto` first, then the 12 categories in display order. */
export function publicCategories(): PublicCategory[] {
  return [
    { id: AUTO_CATEGORY.id, name: AUTO_CATEGORY.name, emoji: AUTO_CATEGORY.emoji, description: AUTO_CATEGORY.description, starters: [] },
    ...CATEGORIES.map(({ id, name, emoji, description, starters }) => ({ id, name, emoji, description, starters: [...starters] })),
  ];
}
