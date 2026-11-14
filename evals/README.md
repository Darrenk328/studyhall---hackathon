# Evals

`questions.jsonl` is the Phase 6 eval set: one JSON object per line. So far it has the 8 Engineering Software questions added in the Phase 5 batch; Phase 6 adds about 5 per category.

| Field | Meaning |
|---|---|
| `id` | Stable identifier |
| `category`, `app` | Category id and, for Engineering Software, the app |
| `question` | Asked as written |
| `expected` | The verified answer, in words, for the LLM judge |
| `accept` | Terms that, when present, count as a match (exact-match grading) |
| `reject` | Optional: answers that are known to be wrong |
| `volatile` | True when the answer changes often (Fusion updates monthly); recheck before running |
| `sources` | Official pages the answer was checked against |
| `checked_on` | Date the expected answer was verified (YYYY-MM-DD) |
| `notes` | What exactly the source says, and how to grade edge cases |

`manual/` holds live manual runs (receipts as JSONL plus a summary). `results.json` (Phase 6) feeds the table on `/about`.
