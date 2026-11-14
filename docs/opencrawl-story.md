# OpenCrawl in Studyhall: a log of real moments

Only real events, with the date and what happened. No hypotheticals.

## Nov 14, 2026: setup

- Darren installed the CLI (0.4.66) and signed in to the **Studyhall** workspace.
- Claude Code capture was installed with **no history imported**, and every non-Studyhall project was excluded first.
- The long session that built Studyhall so far was also excluded, because it predates the team's consent to capture.
- The MCP server was added for `~/studyhall`, waiting for Darren's `/mcp` sign-in.
- Nothing had been uploaded at the end of setup (`lastUpload: null`).

## Nov 14, 2026: first real share, and a fresh agent that didn't look

- **The share happened.**
  - A local Studyhall run checked the MATLAB example in Check my code. The verdict was `matlab.addons.install` deprecated (not recommended) in R2026b → `mpminstall`, citing mathworks.com.
  - "Share with my team's agents" posted one fact to the `verified-api-facts` board.
  - A board search confirmed the post word for word: "[Studyhall verified · 2026-11-14] matlab.addons.install is deprecated (not recommended) in MATLAB R2026b → use mpminstall. Source: https://www.mathworks.com/help/matlab/ref/matlab.addons.install.html".
- **The test, unstaged:**
  - A fresh Claude Code session in `~/studyhall` (OpenCrawl MCP signed in, capture installed) was asked only: "Write a short MATLAB snippet that installs an add-on from a local file named `SignalTools.mltbx`". It wasn't told about OpenCrawl or the deprecation.
  - **It did not find the fact.** It made no tool calls and answered from memory with `matlab.addons.install(toolboxFile, "overwrite")`, the deprecated call.
- **Lesson:** having the fact on the board isn't enough; an agent has to be told to look. The next thing to try is a team instruction (for example in the project's `CLAUDE.md`): "before writing MATLAB, Fusion or Inventor API code, run `opencrawl search` on the topic `verified-api-facts` for the calls you plan to use". Then rerun the same request and record what happens.

## Nov 14, 2026: rerun with the agent rule in CLAUDE.md

- **Setup:**
  - `~/studyhall/CLAUDE.md` now says: "Before writing code that uses MATLAB, Autodesk Fusion or Autodesk Inventor APIs, search OpenCrawl's verified-api-facts board for the functions you plan to use, and follow any Studyhall-verified replacement."
  - The OpenCrawl skill was already installed for Claude Code.
- **The same test, once, unstaged:** a fresh session in `~/studyhall` with the prompt "Write MATLAB code that installs an add-on from SignalTools.mltbx." There was no mention of the board.
- **What happened:**
  - **The agent followed the rule.** It loaded the OpenCrawl skill, said it was "checking the team's verified-api-facts board", and ran OpenCrawl searches.
  - Workspace search found the *first* test session's captured answer, so capture of `~/studyhall` sessions works.
- **It couldn't read the board:**
  - The CLI's `search` covers sessions, connectors and memories, not board posts.
  - The OpenCrawl MCP server (which has `board_search`) reported **"Needs authentication"** in that session. `claude mcp get opencrawl` for `~/studyhall` confirmed it afterwards: Darren's `/mcp` approval hadn't stuck to this project's MCP config.
- **Result:** it again wrote `matlab.addons.install(...)`, but this time it **said so**. Its answer was marked "Board not checked … isn't team-verified" and explained why.
  - It also caught an error in the first session's answer: that answer said `matlab.addons.install` needs R2016a; the rerun said R2018b.
- **Status:** the rule works (the agent tried to look and was honest when it couldn't), but the shared fact still didn't reach the code.
- **Next step:** sign in to the OpenCrawl MCP server with `/mcp` *in a session whose folder is `~/studyhall`*, confirm `claude mcp get opencrawl` shows it connected, then run the same prompt once more.

## Nov 14, 2026: third attempt: the shared fact reached the code

- **Setup:** unchanged; the same `CLAUDE.md` rule, and no code changes.
  - Darren had signed in to the OpenCrawl MCP server with `/mcp` in a session rooted at `~/studyhall`, and `/mcp` showed it connected.
  - Just before the run, `claude mcp get opencrawl` from the command line still reported "Needs authentication", so the desktop app's sign-in and that check disagree.
- **The same test, once, unstaged:** a fresh session in `~/studyhall` with the prompt "Write MATLAB code that installs an add-on from SignalTools.mltbx." There was no mention of the board.
- **What happened:**
  - The agent loaded the OpenCrawl skill and said it was "checking the team's OpenCrawl verified-api-facts board for `matlab.addons.install`, as CLAUDE.md asks".
  - Its tool calls, in the session transcript: the skill, several Bash calls, a ToolSearch and one WebFetch. **No OpenCrawl MCP tool call appears**, so it reached the board through the OpenCrawl CLI, not MCP. The transcript view doesn't show the Bash commands themselves.
  - It then checked MathWorks' own page with WebFetch.
- **Result: the code used the shared fact.** It wrote `mpminstall(toolboxFile)` for R2026b and later, with a `matlab.addons.install` fallback for older releases (`isMATLABReleaseOlderThan("R2026b")`). Its explanation:
  - "the team's verified-api-facts board says `matlab.addons.install` is 'not recommended' from R2026b and points to `mpminstall`";
  - "MathWorks' own page agrees";
  - "I haven't run this in MATLAB."
- **What it shows:**
  - With the one-line rule in `CLAUDE.md`, a fresh agent looked up the Studyhall-verified fact before writing code, cited it, verified it against the vendor's page, and changed its code.
  - Attempts 1 and 2, without the rule or without board access, used the deprecated call.
  - One run each; not a measured rate.
- **Open question:** the MCP path still reports "Needs authentication" from the command line. The CLI path worked.

## Moments where OpenCrawl helped

- **Nov 14, 2026:** the third attempt above. A Studyhall share on the `verified-api-facts` board led a fresh coding agent to write `mpminstall` instead of the deprecated `matlab.addons.install`, citing the board and MathWorks.

## Earlier notes

- Before the third attempt, the closest was the rerun: its agent found an earlier session's answer through workspace search and corrected a version detail in it.
