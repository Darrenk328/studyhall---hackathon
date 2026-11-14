## Code-check eval: Check my code (separate eval)

Run `code-v051-2026-11-14` · core 0.5.0 · 12 snippets (`evals/code-snippets.jsonl`): 4 MATLAB, 4 Fusion Python, 4 Inventor iLogic. 6 use a call that the vendor's official docs mark deprecated or retired; 6 use only documented, current calls. Each labelled call has its official source and check date. Scored on each snippet's labelled call; reported as-is, with no tuning. It checks API usage against the docs; it doesn't run the code. One snippet is about 17 points per group.

| Measure | Result |
|---|---|
| **Flag rate on bad calls** (marked deprecated or removed) | **100%** (6 of 6) |
| Documented replacement named | 6 of 6 |
| **False-flag rate on clean calls** (marked deprecated or removed) | **0%** (0 of 6) |
| Not found in the docs searched | 0 bad, 0 clean |
| Unverifiable | 0 bad, 0 clean |

Other (unlabelled) calls in the snippets: 21 current, 0 deprecated, 0 removed, 8 not found, 3 unverifiable. Median 8.5s per check · You.com $0.498 and Claude $0.410 for all 12.

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
