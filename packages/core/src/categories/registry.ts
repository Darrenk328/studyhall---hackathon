import { business } from "./business.js";
import { creative } from "./creative.js";
import { finance } from "./finance.js";
import { food } from "./food.js";
import { gaming } from "./gaming.js";
import { health } from "./health.js";
import { learning } from "./learning.js";
import { legal } from "./legal.js";
import { science } from "./science.js";
import { sports } from "./sports.js";
import { tech } from "./tech.js";
import { travel } from "./travel.js";
import type { Category } from "./types.js";

/** Display order. */
export const CATEGORIES: readonly Category[] = [
  gaming, health, business, finance, tech, science, legal, travel, food, sports, learning, creative,
];

export const AUTO_ID = "auto";

/** The "auto" pseudo-category: a cheap classifier picks a real category. */
export const AUTO_CATEGORY = {
  id: AUTO_ID,
  name: "Auto",
  emoji: "✨",
  icon: "sparkles",
  description: "Studyhall picks the best category for your question.",
} as const;

/** Used when the classifier fails. */
export const FALLBACK_CATEGORY_ID = "learning";

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): Category | undefined {
  return BY_ID.get(id.trim().toLowerCase());
}

export function categoryIds(): string[] {
  return CATEGORIES.map((c) => c.id);
}

export class UnknownCategoryError extends Error {
  constructor(readonly id: string) {
    super(`Unknown category "${id}". Use one of: ${[AUTO_ID, ...categoryIds()].join(", ")}`);
    this.name = "UnknownCategoryError";
  }
}
