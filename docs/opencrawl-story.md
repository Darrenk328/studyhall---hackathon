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

## Moments where OpenCrawl helped

_None yet._ The share worked, but no agent has used a shared fact on its own so far.
