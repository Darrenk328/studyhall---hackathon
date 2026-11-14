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
