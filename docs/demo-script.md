# Studyhall: 3-minute demo script

**Pre-demo checklist:** `/api/health` shows `"search":"ok"` (and the `core` version you expect) · You.com balance above $3 (you.com/platform) · `/?demo=1` shows 4 demo buttons · 5 minutes before going on, ask one live warm-up question (for example the iOS one below) so the server isn't cold.

**Setup.** Open the live site with `?demo=1`. Clear the browser's session first so every category starts empty.
- **Live:** the two questions in Demos 1 and 2 (Travel and Tech) are fast and run live, with compare on. Each costs about $0.03 of You.com.
- **Replay:** MATLAB (Demo 3) and Artemis II (backup) are slower or need more searching, so they go through the demo buttons. Replays carry a visible "Replay of a live answer recorded …" label, so say "recorded" when you use one.
- **If a live question stalls** (no answer after about 25s, or the Wi-Fi drops), click its demo button instead and say it's a recording. UK ETA and Python both have one; iOS doesn't, so use Python as the Tech fallback.

**The one-line pitch:** Studyhall matches the You.com Research API on accuracy and shows its receipts: every claim is cited and checked against the page it cites.

**Don't say:**
- that Studyhall is more accurate than You.com. It isn't (92% vs 94%).
- that it never makes mistakes. 3 of 65 answers were partial, and 2 were declines.
- anything about the Claude Code plugin, which isn't built yet.

---

### 0:00 to 0:20 · The problem

> "Ask a language model something that changed this year and it answers from memory, which is frozen at its training cutoff. We tested 49 time-sensitive questions across 13 topics. From memory, the model got 31% right. Studyhall got 92%."

### 0:20 to 1:00 · Demo 1, live: a fact that changed (Travel, compare on)

Pick **Travel**, turn on **Compare with no search**, and type:

> **How much does a UK Electronic Travel Authorisation (ETA) cost to apply for?**

| Check on stage | Expected |
|---|---|
| Studyhall's answer | **£20** (since 8 April 2026), citing GOV.UK and/or the Home Office factsheet |
| From memory (left column) | usually **£16**, the fee until April 2026 |
| Time | about 9 to 13s |

> "On the left, the same model with no search says £16, which was right until April. On the right, Studyhall plans searches, reads GOV.UK and the Home Office factsheet, and answers £20, with citations."

Point at the status line (Planning → Searching → Reading → Verifying), the citation chips, and the **Where they differ** card.

### 1:00 to 1:30 · The receipts

Click **Receipts**.

> "This is what makes it checkable. Every claim is underlined by verdict: a second model checked each sentence against the exact page it cites. Here are the sources, how fresh they are, and why the confidence badge says what it says."

Scroll to one claim's evidence quote.

### 1:30 to 1:55 · Demo 2, live: a fast-moving product (Tech, compare on)

Pick **Tech**, keep compare on, and type:

> **As of November 2026, what is the latest major version of Apple's iOS?**

| Check on stage | Expected |
|---|---|
| Studyhall's answer | **iOS 27**, released September 14, 2026. The latest point release may be newer than 27.2.1 by demo day; only the major version matters. |
| From memory | it hedges, typically "iOS 26, and probably iOS 27 by now" |
| Time | about 9 to 13s |

> "Same idea: from memory it can only guess. Studyhall reads Apple's own pages and answers iOS 27."

### 1:55 to 2:25 · Demo 3, recorded: software that moves fast (Engineering, MATLAB)

Click the demo button **"Which function replaces matlab.addons.install?"** and say it's a recorded answer.

| Check on stage | Expected |
|---|---|
| Opening line | "Based on MATLAB R2026b" with a citation |
| Answer | **`mpminstall`** replaces `matlab.addons.install`, with how the old options map to the new ones, citing MathWorks' reference page |
| From memory | says nothing replaces it |

> "Engineering software ships every few months, so Studyhall looks up the current release first. MATLAB R2026b is current. From memory, the model says nothing replaces this function. Studyhall finds that `mpminstall` replaces it, citing MathWorks' own documentation."

### 2:25 to 2:45 · How we know (About page)

Open **/about**.

> "We didn't grade ourselves by eye. 65 questions, each with an answer verified from an official source that day. Three systems answered each one on the same day, and a blind judge graded them without knowing which system wrote which answer. Studyhall is on par with You.com's Research API, 92 versus 94%, and it's the one that shows you claim-level receipts. When the model answered a time-sensitive question from memory, it was wrong one time in five."

### 2:45 to 3:00 · Close

> "Studyhall doesn't guess. It studies first, answers only from what it read, and shows its work, so you can check it. Thank you."

---

**Backups**, if there's time or a question goes wrong (all demo buttons, so recorded):
- **Python** (Tech): "As of November 2026, what is the newest stable feature (minor) release of Python?" Expected: **Python 3.15**, released October 9, 2026. From memory, it's unsure whether 3.15 has shipped.
- **Artemis II** (Science): "As of November 2026, which crewed mission holds the record for the farthest distance humans have traveled from Earth?" Expected: **Artemis II**, which passed Apollo 13's record on April 6, 2026, citing NASA. From memory, in the recording, it hedges ("Artemis II is the likely record-holder, but I can't confirm it"); in the eval it answered Apollo 13.

**If asked how it's checked:**
- Verify was tested by planting errors in real answers: changed numbers, a flipped "not", a swapped organization. It flagged all 8 as unsupported (rechecked live on Nov 14).
- After the repair pass, 0% of claims were left unsupported and 100% of citations pointed at a real source.
- The High confidence badge was correct 41 times out of 43; the other 2 were partly correct.
