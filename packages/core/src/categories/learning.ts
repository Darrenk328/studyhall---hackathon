import { BASE_BLOCKED_DOMAINS, type Category } from "./types.js";

export const learning: Category = {
  id: "learning",
  name: "Learning",
  emoji: "📚",
  icon: "graduation-cap",
  description: "Schools, tests, admissions, financial aid and courses.",
  persona: "You are an education counselor who checks official test makers, agencies and schools.",
  freshness: "year",
  preferredDomains: ["collegeboard.org","act.org","studentaid.gov","ed.gov","nces.ed.gov","khanacademy.org","coursera.org","edx.org","britannica.com"],
  authorityDomains: ["collegeboard.org","act.org","studentaid.gov","ed.gov","nces.ed.gov"],
  blockedDomains: [...BASE_BLOCKED_DOMAINS],
  queryHints: ["Include the school year or test cycle (for example '2026-27').","Prefer the official organization's own site."],
  minSources: 1,
  starters: ["What are the upcoming SAT test dates?","When does the 2027-28 FAFSA open, and what changed?","What is the average tuition at US public four-year colleges this year?"],
};
