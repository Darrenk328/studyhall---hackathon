/**
 * Positioning: the four flagship verticals, where outdated information is expensive, plus Check a
 * claim. Every example below was verified against an official source (see docs/demo-questions.md
 * and evals/questions.jsonl). Client-safe: no core code.
 */

export const HOME_ID = "home";
export const CHECK_ID = "check";

export interface Flagship {
  id: "engineering" | "health" | "legal" | "business";
  /** Why outdated information is expensive here, in one line. */
  why: string;
  examples: [string, string];
  /** A calm, visible note for categories with safety rules. */
  note?: string;
}

export const FLAGSHIPS: Flagship[] = [
  {
    id: "engineering",
    why: "Every release changes the API. MATLAB R2026b retired matlab.addons.install; Fusion ships monthly builds.",
    examples: ["Which function replaces matlab.addons.install?", "What is the current release of Autodesk Inventor?"],
  },
  {
    id: "health",
    why: "Guidance changes with new recommendations and each season's data.",
    examples: [
      "According to the CDC, how many minutes of moderate-intensity aerobic physical activity per week do adults need?",
      "What is the standard monthly Medicare Part B premium for 2026?",
    ],
    note: "Information, not medical advice. For decisions about your own health, talk to a clinician.",
  },
  {
    id: "legal",
    why: "Laws, rates and thresholds change, and they differ by jurisdiction.",
    examples: [
      "What is the UK National Living Wage hourly rate for workers aged 21 and over from April 2026?",
      "From what date can private tenants in England no longer be evicted using a 'no fault' Section 21 notice under the Renters' Rights Act?",
    ],
    note: "Information, not legal advice. Laws vary by jurisdiction, and each answer names the jurisdiction its sources cover.",
  },
  {
    id: "business",
    why: "Executives, rates and policies change, and stale facts end up in reports.",
    examples: ["As of November 2026, who is the Chair of the U.S. Federal Reserve Board of Governors?", "As of November 2026, who is the CEO of Target Corporation?"],
  },
];

/** Rail order: Check a claim, then the flagships; everything else is under "More topics". */
export const FEATURED_IDS: string[] = FLAGSHIPS.map((f) => f.id);

export const noteFor = (categoryId: string): string | undefined => FLAGSHIPS.find((f) => f.id === categoryId)?.note;

/** Check a claim examples: one per flagship plus one from the past week's news. All verified; see docs/demo-questions.md. */
export const CHECK_EXAMPLES: { label: string; vertical: string; text: string }[] = [
  { vertical: "Engineering", label: "matlab.addons.install is still recommended", text: "matlab.addons.install is still the recommended way to install add-ons." },
  {
    vertical: "Health",
    label: "CDC: flu activity higher than usual",
    text: "CDC says seasonal flu activity is higher than usual for early November 2026, with 11.3% of flu tests positive in the week ending November 7.",
  },
  { vertical: "Legal", label: "UK National Living Wage is £12.21", text: "The UK National Living Wage for workers aged 21 and over is £12.21 an hour." },
  { vertical: "Business", label: "Jerome Powell chairs the Fed", text: "Jerome Powell is the Chair of the Federal Reserve." },
  {
    vertical: "This week's news",
    label: "CMS's $10B rural health awards (Nov 9)",
    text: "On November 9, 2026, CMS announced $10 billion in second-year Rural Health Transformation Program awards to all 50 states.",
  },
];
