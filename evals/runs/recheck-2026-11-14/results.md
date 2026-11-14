# Studyhall evals

Run recheck-2026-11-14 · 13 questions (12 time-sensitive, 1 stable) · each system answered every question the same day · graded by term match plus a blind Sonnet judge (the judge saw one anonymized answer at a time). Declines are reported separately and never count as correct.

## Overall

| System | Correct | Partial | Wrong | Declined | Accuracy when it answered | Median latency | Cost per question |
|---|---|---|---|---|---|---|---|
| Studyhall | **92%** | 0% | 0% | 8% | 100% | 14.5s | $0.104 |

## The pitch numbers

- When the bare model answered a time-sensitive question from memory (didn't decline), it was **wrong 0%** of the time (0 of 0); wrong or only partly right 0% (0 of 0).
- On the 0 questions the bare model got wrong or declined, Studyhall was **correct 0%** (0 of 0). The You.com Research API was correct on 0 of the same 0 (0%).

## Time-sensitive vs stable (correct)

| System | Time-sensitive | Stable |
|---|---|---|
| Studyhall | 92% (n=12) | 100% (n=1) |

## By category (correct)

| Category | Studyhall |
|---|---|
| business | 100% (n=1) |
| engineering | 88% (n=8) |
| food | 100% (n=1) |
| learning | 100% (n=1) |
| legal | 100% (n=1) |
| science | 100% (n=1) |

## Studyhall checks

- Citation validity (cited numbers that matched a real source): **100%**
- Unsupported-claim rate after the repair pass: **0%**

| Confidence badge | n | Correct | Partial | Wrong | Declined | Accuracy |
|---|---|---|---|---|---|---|
| high | 5 | 5 | 0 | 0 | 0 | 100% |
| medium | 8 | 7 | 0 | 0 | 1 | 88% |
| low | 0 | 0 | 0 | 0 | 0 | 0% |

## Grading cross-check

- Studyhall: term match agreed with the judge on 100% of answers; 0 system errors.
- Judge cost: $0.037. Costs use list prices (Claude: Anthropic API rates; You.com: published usage-based rates, Research API at "standard" effort).
