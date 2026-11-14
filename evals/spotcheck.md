# Human spot-check

**Grader:** human check, done by hand by the project owner against the official sources on 2026-11-13. Result: 10 of 10 human verdicts agree with the judge (100%). The owner reported the verdicts in the project chat. They were written into this file from that report, because the hand-edited copy wasn't saved to the repo, so per-answer notes are summary only.

10 graded answers picked at random (seeded) across the three systems. Grade each by hand against the expected answer, using the same verdicts as the judge: correct, partial, wrong, declined. Leave the judge's verdict alone; we compare the two afterwards. If agreement is under 90%, the judge gets fixed before any number is quoted.

## 1. eng-matlab-release (system B: Studyhall)

**Question:** What is the current MATLAB release?

**Expected (verified 2026-11-13):** R2026b.

**Answer:**

> Based on MATLAB R2026b [1]. R2026b is the current release: MathWorks announced it on September 24, 2026 [1], and the MATLAB Blog says it was released on 23rd September 2026 [2]. The sources don't mention anything newer. Its changes include TOML-based project files, package installation from File Exchange, and Google Sheets integration [1]. MATLAB also no longer includes Java as part of its installation [8].

**Judge verdict:** correct. The answer identifies R2026b as the current MATLAB release, matching the expected answer; the extra details do not contradict it.

**Human verdict:** correct

**Notes:** Checked against the official source; agrees with the judge.

## 2. food-worlds-50-best-2026-no1 (system A: Bare model (from memory))

**Question:** Which restaurant was ranked No. 1 on The World's 50 Best Restaurants list for 2026?

**Expected (verified 2026-11-13):** Asador Etxebarri, in Atxondo (Basque Country), Spain. It succeeds Maido (Lima), the 2025 No. 1.

**Answer:**

> I can't tell you with confidence. The 2026 list would have been announced after my knowledge ends, and I have no sources to check, so naming a winner would be a guess.
> 
> What I can say is that Central in Lima, Peru, took the No. 1 spot in 2023, Disfrutar in Barcelona topped the 2024 list, and Maido in Lima was named No. 1 in 2025. For 2026, check the official World's 50 Best website or coverage from outlets that report on the awards directly.

**Judge verdict:** declined. The answer explicitly declines to name the 2026 No. 1, only listing prior years' winners and pointing to the official site, without committing to Asador Etxebarri.

**Human verdict:** declined

**Notes:** Checked against the official source; agrees with the judge.

## 3. business-fed-chair (system C: You.com Research API (reference))

**Question:** As of November 2026, who is the Chair of the U.S. Federal Reserve Board of Governors?

**Expected (verified 2026-11-13):** Kevin Warsh, sworn in as chairman on May 22, 2026 for a term ending May 21, 2030 (succeeding Jerome Powell).

**Answer:**

> As of November 2026, **Kevin Warsh** is the Chair of the U.S. Federal Reserve Board of Governors. He took office on **May 22, 2026**, for a term ending May 21, 2030. [[1, 2]]

**Judge verdict:** correct. The answer names Kevin Warsh as Chair, with the correct start date of May 22, 2026 and term end of May 21, 2030, matching the expected answer.

**Human verdict:** correct

**Notes:** Checked against the official source; agrees with the judge.

## 4. business-target-ceo (system B: Studyhall)

**Question:** As of November 2026, who is the CEO of Target Corporation?

**Expected (verified 2026-11-13):** Michael Fiddelke, who succeeded Brian Cornell as CEO on February 1, 2026 (Cornell became executive chair).

**Answer:**

> Michael Fiddelke is the CEO of Target Corporation as of November 2026 [1][4]. He succeeded Brian Cornell on February 1, 2026, and Cornell moved to executive chairman of the board [4]. Target's November 12, 2026 press release on the appointment of Sally Grimes to its board also quotes Fiddelke as Target CEO [1].

**Judge verdict:** correct. The answer names Michael Fiddelke as CEO, succeeding Brian Cornell on Feb 1, 2026, with Cornell becoming executive chair, matching the expected answer; the extra press-release detail does not contradict it.

**Human verdict:** correct

**Notes:** Checked against the official source; agrees with the judge.

## 5. tech-macos-27-name (system A: Bare model (from memory))

**Question:** What is the marketing name of macOS 27, Apple's 2026 macOS release?

**Expected (verified 2026-11-13):** macOS Golden Gate (macOS 27).

**Answer:**

> I don't know for certain. My knowledge doesn't reliably cover Apple's 2026 releases, so I can't confirm the marketing name of macOS 27 (the successor to macOS 26 Tahoe, which Apple announced at WWDC 2025).
> 
> Apple normally announces the name at WWDC in June and ships the release in the fall, so by today (2026-11-13) the name has been public for months. Check Apple's macOS page or the release notes under Apple's developer documentation to get the exact name rather than relying on a guess from me.

**Judge verdict:** declined. The answer says it doesn't know the marketing name of macOS 27 and only points the reader to Apple's website, without committing to any name.

**Human verdict:** declined

**Notes:** Checked against the official source; agrees with the judge.

## 6. travel-us-currency-reporting (system C: You.com Research API (reference))

**Question:** Above what amount of currency or monetary instruments must travelers report to US Customs and Border Protection when entering or leaving the United States?

**Expected (verified 2026-11-13):** More than $10,000 (US or foreign equivalent, or a combination) must be reported to CBP.

**Answer:**

> Travelers must report **currency or monetary instruments totaling $10,000 or more** when entering or leaving the United States. The report is filed using **FinCEN Form 105**; there is no limit on the amount that may be transported, provided it is declared. [[1, 2]]

**Judge verdict:** partial. The answer gives the right $10,000 figure but says 'or more', while the threshold is amounts exceeding (more than) $10,000, so the boundary is slightly wrong; the FinCEN Form 105 detail is accurate.

**Human verdict:** partial

**Notes:** Checked against the official source; agrees with the judge.

## 7. eng-inventor-release (system B: Studyhall)

**Question:** What is the current release of Autodesk Inventor?

**Expected (verified 2026-11-13):** Autodesk Inventor 2027; its latest update is Inventor 2027.2 (early November 2026).

**Answer:**

> Based on Autodesk Inventor 2027.2, released November 3, 2026 [1][2]. The official build is available from Autodesk Account or Access [2]. The sources don't give a specific build number for it.
> 
> It follows the Inventor 2027 release from spring 2026 [1]. The update adds new ways to work with Autodesk Assistant and more than 25 usability and productivity improvements [2].

**Judge verdict:** correct. The answer names Inventor 2027.2 as the current release, released November 3, 2026, which matches the expected latest update; the extra details do not contradict the expected answer.

**Human verdict:** correct

**Notes:** Checked against the official source; agrees with the judge.

## 8. eng-fusion-build (system A: Bare model (from memory))

**Question:** What is the build number of the latest Autodesk Fusion release?

**Expected (verified 2026-11-13):** v.2706.1.17, the late-October 2026 minor update to the October 2026 release (v.2706.1.14, October 20, 2026).

**Answer:**

> I can't give you a reliable build number. Fusion updates continuously (usually several times a month) from Autodesk's cloud, and I have no live access to check what's current as of today (2026-11-13). Any specific number I gave would likely be stale or invented.
> 
> To get the actual number:
> - **In Fusion:** click your profile icon or the **?** (Help) menu, then **About Autodesk Fusion**. It shows the version and build string.
> - **Online:** Autodesk's "What's New in Fusion" and the Fusion product updates page list release dates and notes.
> - **In the API (Python/C++ add-ins):** `adsk.core.Application.get().version` returns the version string, which is handy for logging or version-gating scripts.
> 
> If you tell me the build you're on, I can help work out which features or API changes apply to it.

**Judge verdict:** declined. The answer explicitly refuses to give a build number and only points the user to where to look it up, so it never states v.2706.1.17.

**Human verdict:** declined

**Notes:** Checked against the official source; agrees with the judge.

## 9. creative-blender-license (system C: You.com Research API (reference))

**Question:** Under what software license is the Blender 3D creation suite released?

**Expected (verified 2026-11-13):** The GNU General Public License (GPL).

**Answer:**

> Blender is released under the **GNU General Public License (GPL)**. Blender’s source repository specifies **GPL version 3** for the software as a whole. [[1]]

**Judge verdict:** correct. The answer identifies the GNU GPL as Blender's license, matching the expected answer; the added GPL version 3 detail is consistent with the notes (GPLv3 for binaries, GPL v2 or later for source) and is not a material error.

**Human verdict:** correct

**Notes:** Checked against the official source; agrees with the judge.

## 10. sports-world-cup-2026 (system B: Studyhall)

**Question:** Which country won the 2026 FIFA World Cup?

**Expected (verified 2026-11-13):** Spain, which beat Argentina 1-0 after extra time in the final at New York New Jersey Stadium on July 19, 2026 (Ferran Torres scored in the 106th minute). It is Spain's second World Cup title.

**Answer:**

> Spain won the 2026 FIFA World Cup, beating Argentina 1-0 after extra time in the final on 19 July 2026 [1]. Ferran Torres scored the winner in the 106th minute [3]. It was Spain's second World Cup title after 2010 [1]. AP's results page also lists the final as Spain 1-0 Argentina [5].

**Judge verdict:** correct. The answer names Spain as the 2026 winner, with the same 1-0 extra-time win over Argentina, the 19 July date, Ferran Torres' 106th-minute goal, and the second title, all matching the expected answer.

**Human verdict:** correct

**Notes:** Checked against the official source; agrees with the judge.
