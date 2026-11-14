# Letting an AI agent operate MATLAB, Fusion and Inventor (research only, Nov 14, 2026)

Not built. A post-hackathon option, found with web research. **Verified** means the page was opened; **unverified** means it was seen only in search results or inferred.

## MATLAB

- **MATLAB MCP Server, official (MathWorks):** https://github.com/matlab/matlab-mcp-server
  - **Verified:**
    - Tools: `evaluate_matlab_code`, `run_matlab_file`, `run_matlab_test_file`, `check_matlab_code` (static analysis) and `detect_matlab_toolboxes`.
    - Needs a local MATLAB R2021a or later; attaching to an existing session needs R2023a or later.
    - Runs on Windows, Linux and macOS.
    - Licensed for use only under the MathWorks Software License Agreement: one user per server, no sharing.
    - Telemetry is on by default (`--disable-telemetry=true` turns it off).
- **MATLAB Engine API for Python** (MathWorks): the classic programmatic route, with local MATLAB plus a Python package. Unverified in this session.

## Autodesk Fusion

- **Fusion MCP Server, official, local:** https://help.autodesk.com/view/fusion360/ENU/?guid=FMCP-OVERVIEW
  - **Verified:**
    - Live modeling and commands in the open Fusion session.
    - Turned on in Preferences > General > API.
    - Authentication is "None, local connection only".
  - **Not stated on that page:** OS support and licensing.
- **Fusion Data MCP Server, official, cloud** (same page): reads Manufacturing Data Model data with OAuth. Fusion doesn't need to be running.
- **Fusion Python API and add-ins:** the fallback for a custom local bridge.
- **Community MCP servers:** several exist. They're unvetted and probably superseded by the official server.

## Autodesk Inventor

- **Inventor API (COM), iLogic and add-ins:** https://aps.autodesk.com/developer/overview/inventor-api
  - Windows only, which is consistent with every integration found. Not confirmed on an Autodesk page in this session.
- **No official Inventor MCP server was found:** Autodesk's MCP overview page doesn't mention Inventor.
- **Community servers:**
  - NeonGlay/inventor-mcp (verified): MIT licence, 53 stars, archived. Its `execute_python` tool runs arbitrary Python against Inventor.
  - Others are unvetted.

## Security

- Code-execution tools (MATLAB `evaluate_matlab_code`, Inventor community `execute_python`) run arbitrary code with the user's privileges.
- Fusion's local MCP server has no authentication, so any local process that can reach it can drive Fusion. Whether it binds to localhost only wasn't confirmed.
- **Rule for Studyhall:** never expose these endpoints from the hosted app, and never run them on a shared host. Run the bridges on the user's own machine, with a person approving each call.

## Recommended post-hackathon path

1. **MATLAB first:** the official MathWorks MCP server on the user's machine. It's the most mature and has an explicit security stance. Its licence (one user, no sharing) rules out a hosted multi-user service.
2. **Fusion next:** Autodesk's built-in local MCP server, with a small Python add-in bridge as a fallback.
3. **Inventor last:** a minimal COM bridge on Windows, rather than depending on an archived or unvetted community server.
4. **Keep the hosted app separate:** the Studyhall web app only checks and writes code with receipts. Running code stays on the user's machine, with an approval for each call.
5. **Risks:** licence terms, Fusion's unauthenticated local endpoint, churn in community repos, and none of these have been tested hands-on.
