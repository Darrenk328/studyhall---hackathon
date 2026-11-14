# Studyhall evals

Run fillet-v033-2026-11-14 · 1 questions (1 time-sensitive, 0 stable) · each system answered every question the same day · graded by term match plus a blind Sonnet judge (the judge saw one anonymized answer at a time). Declines are reported separately and never count as correct.

## Overall

| System | Correct | Partial | Wrong | Declined | Accuracy when it answered | Median latency | Cost per question |
|---|---|---|---|---|---|---|---|
| Studyhall | **100%** | 0% | 0% | 0% | 100% | 19.7s | $0.106 |

## The pitch numbers

- When the bare model answered a time-sensitive question from memory (didn't decline), it was **wrong 0%** of the time (0 of 0); wrong or only partly right 0% (0 of 0).
- On the 0 questions the bare model got wrong or declined, Studyhall was **correct 0%** (0 of 0). The You.com Research API was correct on 0 of the same 0 (0%).

## Time-sensitive vs stable (correct)

| System | Time-sensitive | Stable |
|---|---|---|
| Studyhall | 100% (n=1) | 0% (n=0) |

## By category (correct)

| Category | Studyhall |
|---|---|
| engineering | 100% (n=1) |

## Studyhall checks

- Citation validity (cited numbers that matched a real source): **100%**
- Unsupported-claim rate after the repair pass: **0%**

| Confidence badge | n | Correct | Partial | Wrong | Declined | Accuracy |
|---|---|---|---|---|---|---|
| high | 1 | 1 | 0 | 0 | 0 | 100% |
| medium | 0 | 0 | 0 | 0 | 0 | 0% |
| low | 0 | 0 | 0 | 0 | 0 | 0% |

## Grading cross-check

- Studyhall: term match agreed with the judge on 100% of answers; 0 system errors.
- Judge cost: $0.003. Costs use list prices (Claude: Anthropic API rates; You.com: published usage-based rates, Research API at "standard" effort).
