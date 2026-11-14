# Studyhall: 3-minute demo script

**Setup.** Open the live site with `?demo=1` so the four demo questions are one click away. Replays carry a visible "Replay of a live answer recorded …" label, so say "recorded" when you use one. If the Wi-Fi is good, type the question instead and it runs live. Clear the browser's session first so every category starts empty.

**The one-line pitch:** Studyhall matches the You.com Research API on accuracy and shows its receipts: every claim is cited and checked against the page it cites.

**Don't say:**
- that Studyhall is more accurate than You.com. It isn't (92% vs 94%).
- that it never makes mistakes. 3 of 65 answers were partial, and 2 were declines.
- anything about the Claude Code plugin, which isn't built yet.

---

### 0:00 to 0:25 · The problem

> "Ask a language model something that changed this year and it answers from memory, which is frozen at its training cutoff. We tested 49 time-sensitive questions across 13 topics. From memory, the model got 31% right. Studyhall got 92%."

*(Show the About page table for a second, or say it over the empty chat.)*

### 0:25 to 1:05 · Demo 1: a fact that changed (Travel, compare on)

Click **"How much does a UK Electronic Travel Authorisation (ETA) cost to apply for?"**

> "On the left, the same model with no search. It says £16, which was right until April. On the right, Studyhall plans searches, reads GOV.UK and the Home Office factsheet, and answers £20, with citations."

Point at:
- the status line as it goes Planning → Searching → Reading → Verifying;
- the citation chips;
- the **Where they differ** card: "£16 vs £20, with the source."

### 1:05 to 1:40 · The receipts

Click **Receipts**.

> "This is what makes it checkable. Every claim is underlined by verdict: a second model checked each sentence against the exact page it cites. Here are the sources, how fresh they are, and why the confidence badge says High: every claim is supported, the sources are current, and two independent sites agree."

Scroll to one claim's evidence quote.

### 1:40 to 2:20 · Demo 2: software that moves fast (Engineering, MATLAB, compare on)

Click **"Which function replaces matlab.addons.install?"**

> "Engineering software ships every few months, so Studyhall looks up the current release first. MATLAB R2026b is current, and the answer opens by saying which release its sources describe. From memory, the model says nothing replaces it. Studyhall finds that `mpminstall` replaces it as of R2026b, citing MathWorks' own documentation, and shows how the old options map to the new ones."

Point at the "Based on MATLAB R2026b" line and the Software section of the receipts (the current release and its official source).

### 2:20 to 2:45 · How we know (About page)

Open **/about**.

> "We didn't grade ourselves by eye. 65 questions, each with an answer verified from an official source that day. Three systems answered each one on the same day, and a blind judge graded them without knowing which system wrote which answer. Studyhall is on par with You.com's Research API, 92 versus 94%, and it's the one that shows you claim-level receipts. When the model answered a time-sensitive question from memory, it was wrong one time in five."

### 2:45 to 3:00 · Close

> "Studyhall doesn't guess. It studies first, answers only from what it read, and shows its work, so you can check it. Thank you."

---

**Backups**, if there's time or a question goes wrong:
- **"As of November 2026, what is the newest stable feature (minor) release of Python?"** From memory: 3.14. Studyhall: 3.15, released October 9, 2026.
- **"As of November 2026, which crewed mission holds the record for the farthest distance humans have traveled from Earth?"** From memory, in the recorded replay, it hedges ("Artemis II is the likely record-holder, but I can't confirm it"); in the eval it answered Apollo 13. Studyhall: Artemis II passed Apollo 13's record on April 6, 2026, citing NASA.

**If asked how it's checked:**
- Verify was tested by planting errors in real answers: changed numbers, a flipped "not", a swapped organization. It flagged all 8 as unsupported.
- After the repair pass, 0% of claims were left unsupported and 100% of citations pointed at a real source.
- The High confidence badge was correct 41 times out of 43; the other 2 were partly correct.
