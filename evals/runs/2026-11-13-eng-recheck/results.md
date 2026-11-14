# Studyhall evals

Run 2026-11-13-eng-recheck · 8 questions (8 time-sensitive, 0 stable) · each system answered every question the same day · graded by term match plus a blind Sonnet judge (the judge saw one anonymized answer at a time). Declines are reported separately and never count as correct.

## Overall

| System | Correct | Partial | Wrong | Declined | Accuracy when it answered | Median latency | Cost per question |
|---|---|---|---|---|---|---|---|
| Studyhall | **75%** | 0% | 0% | 25% | 100% | 14.4s | $0.104 |

## The pitch numbers

- When the bare model answered a time-sensitive question from memory (didn't decline), it was **wrong 0%** of the time (0 of 0); wrong or only partly right 0% (0 of 0).
- On the 0 questions the bare model got wrong or declined, Studyhall was **correct 0%** (0 of 0). The You.com Research API was correct on 0 of the same 0 (0%).

## Time-sensitive vs stable (correct)

| System | Time-sensitive | Stable |
|---|---|---|
| Studyhall | 75% (n=8) | 0% (n=0) |

## By category (correct)

| Category | Studyhall |
|---|---|
| engineering | 75% (n=8) |

## Studyhall checks

- Citation validity (cited numbers that matched a real source): **100%**
- Unsupported-claim rate after the repair pass: **0%**

| Confidence badge | n | Correct | Partial | Wrong | Declined | Accuracy |
|---|---|---|---|---|---|---|
| high | 2 | 2 | 0 | 0 | 0 | 100% |
| medium | 5 | 4 | 0 | 0 | 1 | 80% |
| low | 1 | 0 | 0 | 0 | 1 | 0% |

## Grading cross-check

- Studyhall: term match agreed with the judge on 100% of answers; 0 system errors.
- Judge cost: $0.022. Costs use list prices (Claude: Anthropic API rates; You.com: published usage-based rates, Research API at "standard" effort).
