# Studyhall evals

## Code-check eval, held-out set (code-snippets-heldout.jsonl)

Run `code-heldout-2026-11-14` · core 0.5.0 · 4 snippets (`evals/code-snippets.jsonl`): 4 MATLAB, 4 Fusion Python, 4 Inventor iLogic. 2 use a call that the vendor's official docs mark deprecated or retired; 2 use only documented, current calls. Each labelled call has its official source and check date. Scored on each snippet's labelled call; reported as-is, with no tuning. It checks API usage against the docs; it doesn't run the code. One snippet is about 17 points per group.

| Measure | Result |
|---|---|
| **Flag rate on bad calls** (marked deprecated or removed) | **0%** (0 of 2) |
| Documented replacement named | 0 of 2 |
| **False-flag rate on clean calls** (marked deprecated or removed) | **0%** (0 of 2) |
| Not found in the docs searched | 0 bad, 1 clean |
| Unverifiable | 0 bad, 0 clean |

Other (unlabelled) calls in the snippets: 16 current, 0 deprecated, 0 removed, 5 not found, 2 unverifiable. Median 9.1s per check · You.com $0.279 and Claude $0.230 for all 4.

| Snippet | Label | Call | Verdict | Replacement named (expected) |
|---|---|---|---|---|
| heldout-fusion-pmi-geometry | bad | `PMILeaderLineNoteInput.geometry` | not_parsed | – (geometries) |
| heldout-fusion-sketchtext-height | bad | `SketchText.height` | not_parsed | – (heightParameter) |
| heldout-fusion-circle | clean | `SketchCircles.addByCenterRadius` | current | – |
| heldout-fusion-extrude-input | clean | `ExtrudeFeatures.createInput` | not_found | – |
