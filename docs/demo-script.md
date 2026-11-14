# Studyhall: 3-minute demo script

**Pre-demo checklist:** `/api/health` shows `"search":"ok"` and the `core` version you expect · You.com balance above $3 (you.com/platform) · `/?demo=1` shows 5 demo buttons (Check a claim plus 4 answers) · 5 minutes before going on, run one live warm-up question (for example the iOS one below) so the server isn't cold.

**Setup.** Open the live site **without** `?demo=1` in one tab (for the live runs), and `/?demo=1` in a second tab (for the backups). In demo mode, the Check a claim example and the four demo questions replay recordings instead of running live, so use the first tab for anything you want live. Clear the browser's session first so every mode starts empty.

**The one-line pitch:** Answers with receipts. Every claim checked against the live web, including other AIs' answers.

**Don't say:**
- that Studyhall is more accurate than the You.com Research API. It's on par (92% vs 94%), never "beats" it.
- that it never makes mistakes. In the answer eval, 3 of 65 answers were partial and 2 were declines. In the Check a claim eval, 2 of 10 true claims came back unverifiable.
- that "unverifiable" means false. It means the sources it found didn't settle the claim.
- anything about the Claude Code plugin, which isn't built.

---

### 0:00 to 0:15 · The problem

> "AI answers sound confident even when they're out of date. Here's a real answer from a top model, from our eval, about the UK travel authorisation fee."

### 0:15 to 1:05 · Demo 1: catch a hallucination (Check a claim, live)

In the live tab, click **Check a claim** in the left rail, then click the example **"An AI's answer about the UK ETA fee"**. It pastes the bare model's real answer from the Nov 13 eval and runs the check live (15 to 30 seconds; about $0.07 of You.com).

| Check on stage | Expected |
|---|---|
| "The UK ETA costs £16 per person." | **Contradicted**, red label. Sources say instead: **£20**, citing GOV.UK |
| The other claims | Mostly supported (third-party sites charge extra fees, stays of up to 6 months). One or two may be unverifiable, for example the April 2025 fee history |
| Skipped | The hedge "I can't confirm whether it has changed…", listed with its reason |
| Corrected text | Only the £16 sentence changes, to £20 |

> "Studyhall pulled out each factual claim, searched the live web for all of them at once, and checked each against what the sources say. The £16 fee is contradicted: GOV.UK says £20. Every verdict comes from a source, never from the model's memory, and if the sources don't settle it, it says unverifiable instead of guessing. At the bottom, the corrected text changes only what was wrong."

Point at a citation chip, then at the corrected text.

**Fallback:** if it stalls (no verdicts after about 30 seconds), switch to the demo tab and click **"Check an AI's answer: …"**. Say it's a recording; it has the same result, with a visible "Replay of a live check recorded …" label.

### 1:05 to 1:40 · Demo 2: an answer with receipts (Tech, live, compare on)

Pick **Tech**, turn on **Compare with no search**, and type:

> **As of November 2026, what is the latest major version of Apple's iOS?**

| Check on stage | Expected |
|---|---|
| Studyhall's answer | **iOS 27**, released September 14, 2026. The latest point release may be newer than 27.2.1 by demo day; only the major version matters. |
| From memory (left column) | hedges, typically "iOS 26, and probably iOS 27 by now" |
| Time | about 9 to 13s |

> "Same model, two ways. On the left, from memory, it can only guess. On the right, Studyhall answers from Apple's own pages, and the **Where they differ** card shows exactly what changed."

**Fallback:** Python in the demo tab (Tech): "As of November 2026, what is the newest stable feature (minor) release of Python?" Expected **Python 3.15**, released October 9, 2026.

### 1:40 to 2:15 · Demo 3: the receipts

Click **Receipts** on that answer.

> "This is what makes it checkable. Every claim is underlined by verdict: a second model checked each sentence against the exact page it cites. Here are the sources, how fresh they are, and why the confidence badge says what it says."

Scroll to one claim's evidence.

### 2:15 to 2:45 · How we know the checking works (About page)

Open **/about**.

> "We test the checker itself. We planted errors in real answers (a changed number, a flipped 'not', a swapped organization) and it caught 8 of 8. In our 65-question eval, every citation pointed at a real source, and no unsupported claim was left after repair. And on real hallucinations from that eval, Check a claim caught 10 of 10, with no false alarms on 10 true claims; it's a small eval, so one claim is 10 points. On answering, Studyhall is on par with You.com's Research API, 92 versus 94%, and it's the one that shows its receipts."

### 2:45 to 3:00 · Close

> "Answers with receipts: every claim checked against the live web, including the ones other AIs give you. Thank you."

---

**Backups in the demo tab (`/?demo=1`), all recordings:**
- **Check a claim:** "Check an AI's answer: …" (the UK ETA answer). Expected: £16 contradicted, GOV.UK's £20.
- **UK ETA** (Travel, compare): **£20** (from memory: £16).
- **Python** (Tech, compare): **Python 3.15**, released October 9, 2026.
- **Artemis II** (Science, compare): **Artemis II** passed Apollo 13's record on April 6, 2026, citing NASA. From memory, in the recording, it hedges.
- **MATLAB** (Engineering, compare): **`mpminstall`** replaces `matlab.addons.install`, based on MATLAB R2026b.

**If asked how it's checked:**
- Planted errors: 8 of 8 caught (number, negation, entity), rechecked live on Nov 14.
- Answer eval: 100% of citations valid, 0% of claims unsupported after the repair pass. The High confidence badge was correct 41 times out of 43; the other 2 were partly correct.
- Check a claim eval: 10 of 10 false claims contradicted, 0 of 10 true claims contradicted, 2 of 20 unverifiable (`evals/claims-results.md`).
