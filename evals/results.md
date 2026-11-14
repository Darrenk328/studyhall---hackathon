# Studyhall evals

Run 2026-11-13 · 65 questions (49 time-sensitive, 16 stable) · each system answered every question the same day · graded by term match plus a blind Sonnet judge (the judge saw one anonymized answer at a time). Declines are reported separately and never count as correct.

Judge grades hand-checked on a 10-answer sample, 100% agreement ([spotcheck.md](spotcheck.md)).

## Overall

| System | Correct | Partial | Wrong | Declined | Accuracy when it answered | Median latency | Cost per question |
|---|---|---|---|---|---|---|---|
| Bare model (from memory) | **46%** | 8% | 8% | 38% | 75% | 2.4s | $0.003 |
| Studyhall | **92%** | 5% | 0% | 3% | 95% | 13.1s | $0.089 |
| You.com Research API (reference) | **94%** | 5% | 2% | 0% | 94% | 3.8s | $0.050 |

## The pitch numbers

- When the bare model answered a time-sensitive question from memory (didn't decline), it was **wrong 21%** of the time (5 of 24); wrong or only partly right 38% (9 of 24).
- On the 30 questions the bare model got wrong or declined, Studyhall was **correct 90%** (27 of 30). The You.com Research API was correct on 30 of the same 30 (100%).

## Time-sensitive vs stable (correct)

| System | Time-sensitive | Stable |
|---|---|---|
| Bare model (from memory) | 31% (n=49) | 94% (n=16) |
| Studyhall | 92% (n=49) | 94% (n=16) |
| You.com Research API (reference) | 94% (n=49) | 94% (n=16) |

## By category (correct)

| Category | Bare model (from memory) | Studyhall | You.com Research API (reference) |
|---|---|---|---|
| business | 80% (n=5) | 100% (n=5) | 100% (n=5) |
| creative | 25% (n=4) | 100% (n=4) | 100% (n=4) |
| engineering | 13% (n=8) | 75% (n=8) | 75% (n=8) |
| finance | 20% (n=5) | 100% (n=5) | 100% (n=5) |
| food | 50% (n=4) | 75% (n=4) | 100% (n=4) |
| gaming | 60% (n=5) | 100% (n=5) | 80% (n=5) |
| health | 60% (n=5) | 80% (n=5) | 100% (n=5) |
| learning | 60% (n=5) | 100% (n=5) | 100% (n=5) |
| legal | 100% (n=4) | 100% (n=4) | 100% (n=4) |
| science | 40% (n=5) | 100% (n=5) | 100% (n=5) |
| sports | 40% (n=5) | 80% (n=5) | 100% (n=5) |
| tech | 20% (n=5) | 100% (n=5) | 100% (n=5) |
| travel | 60% (n=5) | 100% (n=5) | 80% (n=5) |

## Studyhall checks

- Citation validity (cited numbers that matched a real source): **100%**
- Unsupported-claim rate after the repair pass: **0%**

| Confidence badge | n | Correct | Partial | Wrong | Declined | Accuracy |
|---|---|---|---|---|---|---|
| high | 43 | 41 | 2 | 0 | 0 | 95% |
| medium | 22 | 19 | 1 | 0 | 2 | 86% |
| low | 0 | 0 | 0 | 0 | 0 | 0% |

## Grading cross-check

- Bare model (from memory): term match agreed with the judge on 83% of answers; 0 system errors.
- Studyhall: term match agreed with the judge on 91% of answers; 0 system errors.
- You.com Research API (reference): term match agreed with the judge on 95% of answers; 0 system errors.
- Judge cost: $0.522. Costs use list prices (Claude: Anthropic API rates; You.com: published usage-based rates, Research API at "standard" effort).

<!-- flagship-fields:begin -->
## Flagship fields (from the published run above; added Nov 14, numbers unchanged)

Correct answers per category on Nov 13, 2026. Small samples: read them as direction, not precision.

| Field | From memory | Studyhall | You.com Research API |
|---|---|---|---|
| Engineering software (8) | 1 of 8 (13%) | 6 of 8 (75%); 7 of 8 in both rechecks (`runs/recheck-2026-11-14`, `runs/recheck-v032-2026-11-14`) | 6 of 8 (75%) |
| Health (5) | 3 of 5 | 4 of 5 | 5 of 5 |
| Legal (4) | 4 of 4 | 4 of 4 | 4 of 4 |
| Business (5) | 4 of 5 | 5 of 5 | 5 of 5 |

- Engineering is the biggest gap between memory and live answers, and the hardest category for every system.
- On health, Studyhall trails the You.com Research API by one answer (partial on the CDC director).
- Legal didn't separate the systems: the model from memory also got all 4.
- Receipts eval: 6 of its 20 claims are from these fields (engineering 3, business 2, health 1, legal 0).
<!-- flagship-fields:end -->

<!-- receipts-eval:begin -->
## Receipts eval: Check a claim (separate eval)

Run `claims-2026-11-14` · core 0.4.0 · 20 claims: 10 false claims the bare model really made in the Nov 13 eval, and 10 true claims from that eval's verified answers (`evals/claims.jsonl`, each with a source and check date). Each claim was pasted into "Check a claim" on its own. Reported as-is, with no tuning after seeing results. This is a different measurement from the 65-question answer eval above, and a small one: one claim is 10 points.

| Measure | Result |
|---|---|
| **Hallucination catch rate** (false claims marked contradicted) | **100%** (10 of 10) |
| **False alarm rate** (true claims marked contradicted) | **0%** (0 of 10) |
| Unverifiable (all claims) | 10% (2 of 20) |
| False claims marked supported | 0 of 10 |
| True claims confirmed (supported) | 8 of 10 |

| Label → verdict | Contradicted | Unverifiable | Supported |
|---|---|---|---|
| False claims | 10 | 0 | 0 |
| True claims | 0 | 2 | 8 |

Median 14.5s per check · You.com $0.308 and Claude $0.398 for all 20 checks.

| Claim | Label | Verdict |
|---|---|---|
| The UK ETA costs £16 per person. | false | contradicted |
| matlab.addons.install isn't deprecated, so nothing replaces it; it is still the current function for installing toolboxes programmatically. | false | contradicted |
| Installing MATLAB still installs its own bundled Java Runtime Environment, so you don't need to install Java separately. | false | contradicted |
| Apollo 13 holds the record for the farthest distance humans have traveled from Earth. | false | contradicted |
| As of November 2026, the newest stable feature release of Python is Python 3.14. | false | contradicted |
| As of November 2026, the latest major version of iOS is iOS 26. | false | contradicted |
| A non-US resident can still buy the $80 America the Beautiful annual pass. | false | contradicted |
| The newest Node.js LTS release line is Node.js 24, codename Krypton. | false | contradicted |
| Phil Spencer is the CEO of Microsoft Gaming. | false | contradicted |
| Jerome Powell is the Chair of the Federal Reserve. | false | contradicted |
| A UK ETA costs £20 to apply for. | true | supported |
| Python 3.15 was first released on October 9, 2026. | true | supported |
| In April 2026, NASA's Artemis II crew broke Apollo 13's record for the farthest distance humans have traveled from Earth. | true | supported |
| Starting in MATLAB R2026b, matlab.addons.install is not recommended and mpminstall is its replacement. | true | unverifiable |
| John Furner succeeded Doug McMillon as Walmart's CEO, effective February 1, 2026. | true | supported |
| The 401(k) employee contribution limit for 2027 is $25,500. | true | supported |
| The Seattle Seahawks beat the New England Patriots 29-13 in Super Bowl LX. | true | supported |
| The 2026 Nobel Prize in Physiology or Medicine went to Karl Deisseroth, Peter Hegemann and Georg Nagel. | true | supported |
| Visa-exempt non-EU visitors may stay in the Schengen area for up to 90 days in any 180-day period. | true | supported |
| An IPv6 address is 128 bits long. | true | unverifiable |
<!-- receipts-eval:end -->

<!-- code-eval:begin -->
## Code-check eval: Check my code (separate eval)

Run `code-2026-11-14` · core 0.5.0 · 12 snippets (`evals/code-snippets.jsonl`): 4 MATLAB, 4 Fusion Python, 4 Inventor iLogic. 6 use a call that the vendor's official docs mark deprecated or retired; 6 use only documented, current calls. Each labelled call has its official source and check date. Scored on each snippet's labelled call; reported as-is, with no tuning. It checks API usage against the docs; it doesn't run the code. One snippet is about 17 points per group.

| Measure | Result |
|---|---|
| **Flag rate on bad calls** (marked deprecated or removed) | **100%** (6 of 6) |
| Documented replacement named | 6 of 6 |
| **False-flag rate on clean calls** (marked deprecated or removed) | **0%** (0 of 6) |
| Not found in the docs searched | 0 bad, 0 clean |
| Unverifiable | 0 bad, 0 clean |

Other (unlabelled) calls in the snippets: 21 current, 0 deprecated, 0 removed, 9 not found, 2 unverifiable. Median 9.6s per check · You.com $0.407 and Claude $0.367 for all 12.

| Snippet | Label | Call | Verdict | Replacement named (expected) |
|---|---|---|---|---|
| matlab-addons-install | bad | `matlab.addons.install` | deprecated | mpminstall (mpminstall) |
| matlab-hist | bad | `hist` | deprecated | histogram (histogram) |
| matlab-readtable | clean | `readtable` | current | – |
| matlab-plot | clean | `plot` | current | – |
| fusion-add-perpendicular | bad | `GeometricConstraints.addPerpendicular` | deprecated | GeometricConstraints.addPerpendicular2 (addPerpendicular2) |
| fusion-set-by-distance-on-path | bad | `setByDistanceOnPath` | deprecated | ConstructionPlaneInput.setByPath or ConstructionPlaneInput.setByPathToObject with a ConstructionPlanePathDefinition object (setByPath) |
| fusion-sketch-rectangle | clean | `SketchLines.addTwoPointRectangle` | current | – |
| fusion-extrude | clean | `ValueInput.createByReal` | current | – |
| ilogic-valueindoc | bad | `iProperties.ValueInDoc` | deprecated | iProperties.Value (iProperties.Value) |
| ilogic-valueincomponent | bad | `iProperties.ValueInComponent` | deprecated | iProperties.Value (iProperties.Value) |
| ilogic-thisdoc-document | clean | `ThisDoc.Document` | current | – |
| ilogic-parameter | clean | `Parameter` | current | – |
<!-- code-eval:end -->
