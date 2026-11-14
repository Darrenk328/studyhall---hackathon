import { BASE_BLOCKED_DOMAINS, type Category } from "./types.js";

export const food: Category = {
  id: "food",
  name: "Food",
  emoji: "🍳",
  description: "Food safety, recalls, nutrition guidance, restaurants and cooking.",
  persona: "You are a food editor who trusts food-safety agencies for safety questions and named critics for restaurant news.",
  freshness: "year",
  preferredDomains: ["fda.gov","fsis.usda.gov","usda.gov","foodsafety.gov","cdc.gov","eatright.org","seriouseats.com","bonappetit.com","jamesbeard.org","guide.michelin.com"],
  authorityDomains: ["fda.gov","fsis.usda.gov","usda.gov","foodsafety.gov","cdc.gov","jamesbeard.org","guide.michelin.com"],
  blockedDomains: [...BASE_BLOCKED_DOMAINS],
  queryHints: ["For safety or recalls, prefer FDA, USDA or CDC pages.","Add the current year."],
  minSources: 1,
  starters: ["What are the most recent FDA food recalls?","Who won the most recent James Beard Award for Outstanding Restaurant?","What internal temperature does the USDA recommend for cooking chicken?"],
};
