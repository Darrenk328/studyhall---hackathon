# Studyhall: 3-minute demo script

**Pre-demo checklist:** `/api/health` shows `"search":"ok"` and the `core` version you expect · You.com balance above $3 (you.com/platform) · `/?demo=1` shows 10 demo buttons (open them with "Show demo questions") · 5 minutes before going on, run one **live warm-up check** in Check a claim (the Business example, "Jerome Powell chairs the Fed", about 9s) so the server isn't cold.

**Setup.** Two tabs:
- **Live tab:** the site **without** `?demo=1`. The demo opens live here.
- **Backup tab:** `/?demo=1`. In demo mode, recorded questions and examples replay instead of running live, so use this tab only for fallbacks.

Clear the browser's session first so every mode starts empty.

**The one-line pitch:** Live, cited answers for fields where outdated info is expensive: engineering, health, law and business. Every claim is checked against the live web, including other AIs' answers.

**Don't say:**
- that Studyhall is more accurate than the You.com Research API. It's on par (92% vs 94%), never "beats" it.
- that it never makes mistakes. In the answer eval, 3 of 65 answers were partial and 2 were declines; on health it trailed You.com by one answer.
- that "unverifiable" means false. It means the sources it found didn't settle the claim.
- anything about the Claude Code plugin, which isn't built.

---

### 0:00 to 0:15 · The problem

> "Engineers, health educators, compliance teams and analysts all ask AI assistants for facts that change: a function deprecated in this release, this season's flu data, this year's wage rate, this year's Fed chair. The model answers from memory, confidently. In our eval, from memory it got 1 of 8 engineering questions right."

### 0:15 to 0:50 · 1. Live: catch an outdated engineering claim (Check a claim)

In the live tab, click the **Check a claim** chip in the top bar (or the Engineering example on the home page's Check a claim card), then the **Engineering** example **"matlab.addons.install is still recommended"**. It runs live; measured at **15.3s** (15.4s when recorded).

| Check on stage | Expected |
|---|---|
| Verdict | **Contradicted**, red label with an ✕ icon |
| Sources (inline under the card) | mathworks.com, the `matlab.addons.install` reference page |
| Sources say instead | not recommended starting in R2026b; use **`mpminstall`** |
| Footer | "Checked against the web at …" and the newest source's age |

> "MATLAB R2026b changed how you install add-ons. Studyhall searched MathWorks' own docs just now and marks the claim contradicted, with the replacement and the page it came from, inline. Only sources decide a verdict; if they don't settle it, it says unverifiable."

**Fallback:** in the backup tab, click **Check: "matlab.addons.install is still the recommended way…"** and say it's a recording.

### 0:50 to 1:25 · 2. Live: a Health question (compare on)

Pick **Health**, turn on **Compare with no search**, and type:

> **According to CDC's FluView, what percentage of flu tests were positive in the week ending November 7, 2026?**

| Check on stage | Expected |
|---|---|
| Studyhall | **11.3%** of specimens positive for influenza in week 44, citing cdc.gov (FluView, published Nov 13, 2026). High confidence. Measured at 15.3s when recorded. |
| From memory (left column) | **declines**: "I can't give you that number… the week ending November 7, 2026 is beyond what I can reliably know" |
| Where they differ | "No disagreements found": the memory side didn't answer, so there's nothing it contradicts |

> "From memory, it can't know last week's CDC data at all. Studyhall reads CDC's FluView, published yesterday, and answers with the number and the page. Notice the calm note: information, not medical advice."

Honest note: we tried two health questions for a stronger "Where they differ" moment. On FluView the memory side declines; on the Medicare Part B premium it already knew $202.90. For a real disagreement on stage, use the UK ETA compare (backup tab): from memory £16, sources £20.

**Fallback:** the FluView replay in the backup tab.

### Optional, if MATLAB is open on the demo Mac (adds about 40s): Check my code, then run it

1. Click the **Engineering Software** chip, then **Check my code**.
2. Click the example **"MATLAB: install a toolbox"**. That's AI-written code using `matlab.addons.install`. It runs live, in about 7s when recorded.
   - Expected: the call list (`matlab.addons.install`) appears first. Then the card says **Deprecated**, with "Use instead: `mpminstall`", citing mathworks.com, "Checking against MATLAB R2026b", and a one-line diff.
3. In MATLAB on the demo Mac, **verify the replacement exists; don't install anything**: type `which mpminstall` (it should print a path inside the MATLAB R2026b install) or `help mpminstall` (it should print the function's help). Say what this shows: the replacement Studyhall cited is real in this release. Studyhall checks API usage against the docs; it doesn't run or test your code.
   - **Darren must test this on his Mac before the demo:** confirm the installed MATLAB is R2026b or later, and that `which mpminstall` returns a path. On an older release it won't, so skip the MATLAB step if it doesn't.

> "AI assistants write code for old releases. Studyhall checks every call against the vendor's own docs for this release, and changes only the flagged line, with a citation."

- **Fusion:** the "Fusion: sketch a rectangle" example is live-checkable. Its sketch calls come back current, but `Application.get` and `Design.cast` currently show "Not found in the official docs searched", a known weakness (see DECISIONS.md), so don't use it as the clean example on stage. Running a script in Fusion (Utilities → Scripts and Add-Ins → create, paste, run) is possible on the Mac, but "Write me a script" isn't built, so there's no generated cube script yet.
- **Inventor:** Windows only, so show it through the iLogic example ("iLogic: read the part number", which flags `iProperties.ValueInDoc` → `iProperties.Value`). Its deprecation notice is from the 2014 help.
- **Fallback:** in the backup tab, **"Check my code: matlab.addons.install(…)"** replays it.

### 1:25 to 1:50 · 3. Release-aware engineering answer (replay)

In the backup tab, click **"How do I make a sheet metal flange in Inventor?"** It takes about 29s live, so use the replay.

> "For software, Studyhall looks up the current release first. Here it found Inventor 2027.2 is current, and it says plainly that the steps come from the 2026 Help, so you know what might differ."

Point at the opening line: "Inventor 2027.2 is the current release [1]; the steps below come from the Inventor 2026 Help documentation…"

### 1:50 to 2:15 · 4. The receipts

Click **Receipts** on the Health answer (or the Inventor replay).

> "Every claim was checked by a second model against the exact page it cites. Sources, dates, the release it looked up, timings: it's all here, and the cited sources are also shown inline, without opening anything."

### 2:15 to 2:45 · 5. Business slide

From `docs/business.md`:
- **Customer:** engineering teams using CAD and MATLAB (design firms, manufacturers, engineering schools).
- **Price:** $49 per seat per month, 200 checks or answers per seat; API at $0.25 per check.
- **Margin:** a check costs $0.035 (one claim) to $0.15 (six claims); about 67% gross margin at typical use.
- **Next step:** put it in front of 3 to 5 engineering teams with the AI answers they already get, and measure agreement and willingness to pay.

> "We match the You.com Research API on answer accuracy, 92 versus 94%, and we add what it doesn't: claim-level verdicts, release awareness, and checking other AIs' answers. Caught 10 of 10 real hallucinations in our small Receipts eval, with no false alarms."

### 2:45 to 3:00 · Close

> "Live, cited answers where outdated info is expensive, and every claim checked against the live web. Thank you."

---

## 6. Backups

**Fast live checks** (live tab, Check a claim):
- **Business, about 9s:** "Jerome Powell is the Chair of the Federal Reserve." Expected **contradicted**: Kevin Warsh, sworn in May 22, 2026 (federalreserve.gov). Measured at 9.2s.
- **This week's news, about 10s:** the CMS $10 billion Rural Health Transformation awards (Nov 9, 2026). Expected **supported** (cms.gov).
- **UK ETA answer, 15 to 30s:** the bare model's real answer from the eval. Expected: £16 **contradicted**, GOV.UK's £20.

**Replays** (backup tab, `/?demo=1`), all recorded live:
- **Check my code:** the MATLAB `matlab.addons.install` snippet (deprecated → `mpminstall`, one corrected line).
- **Check:** MATLAB, Powell, UK ETA answer.
- **Health, compare:** FluView.
- **Engineering:** Inventor flange; MATLAB compare (`mpminstall`).
- **Travel, compare:** UK ETA (£20 vs £16 from memory; a strong "Where they differ").
- **Tech, compare:** Python 3.15.
- **Science, compare:** Artemis II.

**If asked how it's checked:**
- Planted errors: 8 of 8 caught (number, negation, entity), rechecked live on Nov 14.
- Answer eval: 100% of citations valid; 0% of claims unsupported after the repair pass.
- Check a claim eval: 10 of 10 false claims contradicted, 0 of 10 true claims contradicted, 2 of 20 unverifiable (`evals/claims-results.md`).
- By field (answer eval, correct): engineering 6 of 8 (from memory 1 of 8), health 4 of 5, legal 4 of 4, business 5 of 5.
- Check my code eval: 6 of 6 deprecated or retired calls flagged with their documented replacement, 0 of 6 clean calls flagged (`evals/code-results.md`).
