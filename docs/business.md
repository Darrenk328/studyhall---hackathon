# Studyhall: who pays, and why

**One line:** Studyhall gives professionals live, cited answers in fields where outdated information is expensive, and checks other AIs' answers claim by claim.

## Lead customer: engineering teams

**Who:** design firms, manufacturers and engineering schools whose people use CAD and MATLAB (Autodesk Fusion and Inventor, SOLIDWORKS, Onshape, MATLAB and Simulink).

**Pain:** AI assistants answer from a frozen snapshot, so they give workflows and code for old releases. MATLAB R2026b made `matlab.addons.install` "not recommended" in favor of `mpminstall`, and Fusion ships a new build every month. Every outdated workflow or deprecated call costs paid engineering hours and rework.

**Evidence from our eval** (Nov 13, 2026, 8 engineering questions, blind judge): the model answering from memory was correct on 1 of 8 (13%); Studyhall on 6 of 8 (75%), and 7 of 8 in both later rechecks. Engineering was the hardest category for every system, including the You.com Research API (6 of 8).

**Offer:** an engineering team plan (below), with release-aware answers that say which release the docs describe, and Check a claim for AI-written instructions.

## Expansion verticals, ordered by how quickly we think we could sell to them

These are hypotheses, not validated sales.

1. **Business:** analysts and journalists checking current executives, rates and policies before they publish. They can buy individually, with no regulatory review.
2. **Legal:** paralegals and compliance teams checking whether a rule, rate or threshold is still current (for example the UK National Living Wage changed on 1 April 2026). They have budgets, but procurement is slower. It's information, not legal advice, and every answer names its jurisdiction.
3. **Health:** health educators, patient-communication teams and health publishers checking content against current CDC and WHO guidance. This has the most review before purchase. It verifies information; it isn't medical advice.

Every other category (tech, science, travel, finance and more) runs on the same engine and shows that it's general, but isn't a sales focus.

## Product

- **Web app:** answers by topic, compare mode, Check a claim.
- **API:** `POST /api/check` (claims in, verdicts with sources out) for teams that want checking inside their own tools.
- **Next:** a browser extension that checks an AI answer in place, where people read it.

## Pricing hypothesis and unit economics

Measured costs (Nov 14, 2026, list prices; You.com plus Claude):

- a 6-claim check: about **$0.15** ($0.066 You.com + $0.087 Claude)
- a one-claim check: about **$0.035**
- a typical 3-claim check: about **$0.08** (estimated between the two measurements)

These exclude hosting (currently on free tiers) and payment fees.

| Plan | Price (hypothesis) | Included | Cost at typical use | Cost at heavy use | Gross margin |
|---|---|---|---|---|---|
| Free | $0 | 10 checks a day, one-claim checks mostly | about $0.35 a day for a user at the cap | $1.50 a day if every check had 6 claims | Negative by design: acquisition. Capped per user and by a global daily cap. |
| **Engineering team** (main offer) | **$49 per seat per month** | 200 checks or answers per seat | 200 × $0.08 = $16 | 200 × $0.15 = $30 | **67%** typical, 39% at the heavy end |
| API | $0.25 per check (up to 8 claims) | pay as you go | $0.08 | $0.15 | **68%** typical, 40% worst case |

The margin depends mostly on claims per check. Caching repeated lookups and a cheaper first-pass model are the levers if heavy use dominates.

## Market size

Not estimated. A credible number needs sourced counts of CAD and MATLAB seats, and we haven't researched them. We won't invent one.

## Competition, honestly

- **The You.com Research API**, and AI search assistants that answer with citations: as accurate or better on answers (You.com 94% vs Studyhall 92% in our eval). They answer questions; they don't give claim-by-claim verdicts on someone else's text.
- **Generic fact-checking and grounding tools:** they check against a corpus you provide, not against the vendor's current release docs.

**Our edge:**
- claim-level verdicts with receipts (sources, dates, evidence, corrections);
- release awareness for engineering software;
- checking *other* AIs' output, including news from this week that no model was trained on.

## Next step

Put the engineering team plan in front of 3 to 5 design firms or engineering departments, using Check a claim on answers their engineers already get from AI assistants. Measure how many flagged claims they agree were wrong, and whether they would pay $49 a seat.
