import { AUTO_CATEGORY, CATEGORIES } from "@studyhall/core";

export interface PublicCategory {
  id: string;
  name: string;
  /** Lucide icon name, e.g. "stethoscope". */
  icon: string;
  description: string;
  starters: string[];
  /** App chips (Engineering Software only). */
  apps?: { id: string; label: string; name: string }[];
}

/** `auto` first, then the categories in display order. */
export function publicCategories(): PublicCategory[] {
  return [
    { id: AUTO_CATEGORY.id, name: AUTO_CATEGORY.name, icon: AUTO_CATEGORY.icon, description: AUTO_CATEGORY.description, starters: [] },
    ...CATEGORIES.map(({ id, name, icon, description, starters, apps }) => ({
      id,
      name,
      icon,
      description,
      starters: [...starters],
      ...(apps?.length ? { apps: apps.map((a) => ({ id: a.id, label: a.label, name: a.name })) } : {}),
    })),
  ];
}
