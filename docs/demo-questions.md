# Recommended demo questions

Picked from eval run 2026-11-13: the bare model answered wrongly from memory and Studyhall answered correctly, on a time-sensitive, non-volatile fact with an official source. Use them with "Compare with no search" on.

## 1. How much does a UK Electronic Travel Authorisation (ETA) cost to apply for?

- **Category:** Travel
- **Correct answer (verified 2026-11-13):** £20, since 8 April 2026 (previously £16).
- **Official source:** https://www.gov.uk/guidance/apply-for-an-electronic-travel-authorisation-eta
- **Bare model said:** As of my latest knowledge, the UK ETA costs **£16 per person**. It rose from £10 to £16 on 9 April 2025, and I can't confirm whether it has changed since then, so check the official GOV.UK page or the "UK ETA" app before you pay. Apply only through GOV.UK or the official app, because third-party sit…
- **Judge on the bare model:** The answer commits to £16, which was the fee from April 2025 to April 2026; the current fee is £20 since 8 April 2026, so this is outdated despite the hedge.
- **Studyhall:** correct, high confidence, 8.8s.

## 2. As of November 2026, what is the newest stable feature (minor) release of Python?

- **Category:** Tech
- **Correct answer (verified 2026-11-13):** Python 3.15, first released October 9, 2026 (latest patch at check time: 3.15.2, Oct. 25, 2026).
- **Official source:** https://www.python.org/downloads/
- **Bare model said:** As of November 13, 2026, the newest stable feature release should be **Python 3.14**, released in October 2025. Python 3.15 is probably still in its beta or release-candidate phase, with its final release scheduled for October 2026 under PEP 790's schedule. That schedule puts 3.15.0 at around Octobe…
- **Judge on the bare model:** The answer commits to Python 3.14 as the newest stable release, which is outdated; it only conditionally mentions 3.15 as a possibility, so its stated answer is wrong.
- **Studyhall:** correct, high confidence, 17.2s.

## 3. As of November 2026, which crewed mission holds the record for the farthest distance humans have traveled from Earth?

- **Category:** Science
- **Correct answer (verified 2026-11-13):** NASA's Artemis II, whose crew reached 252,756 miles from Earth during the lunar flyby in April 2026, breaking the Apollo 13 record from 1970. Orion splashed down April 10, 2026.
- **Official source:** https://www.nasa.gov/news-release/nasa-welcomes-record-setting-artemis-ii-moonfarers-back-to-earth/
- **Bare model said:** Apollo 13 holds the record for the farthest humans have traveled from Earth. On April 14, 1970, after the spacecraft's lunar free-return trajectory swung around the far side of the Moon, Jim Lovell, Jack Swigert and Fred Haise reached roughly 400,171 km (248,655 miles) from Earth, according to NASA …
- **Judge on the bare model:** The answer commits to Apollo 13 as the record holder, which is outdated; the expected answer is Artemis II (252,756 miles, April 2026), and the hedge about Artemis II does not change the committed answer.
- **Studyhall:** correct, high confidence, 17.3s.

---

## Check a claim examples (hand-maintained)

> `pnpm eval --publish` regenerates this file from the eval. If you republish, copy this section back. Each claim was verified against the official source named here, on the date given.

| Vertical | Claim (as pasted) | Expected verdict | Official source | Checked on |
|---|---|---|---|---|
| Engineering | matlab.addons.install is still the recommended way to install add-ons. | **Contradicted**: not recommended starting in R2026b; use `mpminstall` | https://www.mathworks.com/help/matlab/ref/matlab.addons.install.html | 2026-11-14 (live check: contradicted, 15.3s) |
| Health | CDC says seasonal flu activity is higher than usual for early November 2026, with 11.3% of flu tests positive in the week ending November 7. | **Supported** | https://www.cdc.gov/fluview/surveillance/2026-week-44.html (FluView week 44, published Nov 13, 2026) | 2026-11-14 (live check: 2 supported, 16.2s) |
| Legal | The UK National Living Wage for workers aged 21 and over is £12.21 an hour. | **Contradicted**: £12.71 from 1 April 2026 (£12.21 was the 2025 rate) | https://www.gov.uk/national-minimum-wage-rates | 2026-11-13 (eval question `legal-uk-national-living-wage-2026`) |
| Business | Jerome Powell is the Chair of the Federal Reserve. | **Contradicted**: Kevin Warsh, sworn in May 22, 2026 | https://www.federalreserve.gov/aboutthefed/bios/board/warsh.htm | 2026-11-13 (Receipts eval: contradicted) |
| News, last 7 days | On November 9, 2026, CMS announced $10 billion in second-year Rural Health Transformation Program awards to all 50 states. | **Supported** | https://www.cms.gov/newsroom/press-releases/trump-administration-announces-10-billion-second-year-rural-health-transformation-awards-all-50 | 2026-11-14 (found by a fresh search limited to the past week; live check: 2 supported, 10.0s) |

The news claim is 5 days old on the check date, after any model's training data, so only a live-web check can settle it.
