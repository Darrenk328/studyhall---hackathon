# Studyhall evals

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
