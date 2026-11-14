# Studyhall evals

Run pilot · 4 questions (3 time-sensitive, 1 stable) · each system answered every question the same day · graded by term match plus a blind Sonnet judge (the judge saw one anonymized answer at a time). Declines are reported separately and never count as correct.

## Overall

| System | Correct | Partial | Wrong | Declined | Accuracy when it answered | Median latency | Cost per question |
|---|---|---|---|---|---|---|---|
| Bare model (from memory) | **25%** | 25% | 0% | 50% | 50% | 2.7s | $0.002 |
| Studyhall | **100%** | 0% | 0% | 0% | 100% | 13.6s | $0.095 |
| You.com Research API (reference) | **100%** | 0% | 0% | 0% | 100% | 4.1s | $0.050 |

## Time-sensitive vs stable (correct)

| System | Time-sensitive | Stable |
|---|---|---|
| Bare model (from memory) | 0% (n=3) | 100% (n=1) |
| Studyhall | 100% (n=3) | 100% (n=1) |
| You.com Research API (reference) | 100% (n=3) | 100% (n=1) |

## By category (correct)

| Category | Bare model (from memory) | Studyhall | You.com Research API (reference) |
|---|---|---|---|
| engineering | 0% (n=1) | 100% (n=1) | 100% (n=1) |
| finance | 0% (n=1) | 100% (n=1) | 100% (n=1) |
| sports | 100% (n=1) | 100% (n=1) | 100% (n=1) |
| tech | 0% (n=1) | 100% (n=1) | 100% (n=1) |

## Studyhall checks

- Citation validity (cited numbers that matched a real source): **100%**
- Unsupported-claim rate after the repair pass: **0%**

| Confidence badge | n | Correct | Partial | Wrong | Declined | Accuracy |
|---|---|---|---|---|---|---|
| high | 2 | 2 | 0 | 0 | 0 | 100% |
| medium | 2 | 2 | 0 | 0 | 0 | 100% |
| low | 0 | 0 | 0 | 0 | 0 | 0% |

## Grading cross-check

- Bare model (from memory): term match agreed with the judge on 75% of answers; 0 system errors.
- Studyhall: term match agreed with the judge on 100% of answers; 0 system errors.
- You.com Research API (reference): term match agreed with the judge on 100% of answers; 0 system errors.
- Judge cost: $0.030. Costs use list prices (Claude: Anthropic API rates; You.com: published usage-based rates, Research API at "standard" effort).
