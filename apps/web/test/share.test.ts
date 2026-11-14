import { describe, expect, it, vi } from "vitest";
import { shareBody } from "../components/ShareButton";
import { passcodeOk, postToBoard, shareConfigFromEnv, sharePosts, ShareRequest, SHARE_TOPIC } from "../lib/opencrawl-share";

const codeReq = {
  kind: "code" as const,
  app: "MATLAB",
  release: "R2026b",
  checkedAt: "2026-11-14T18:45:00.000Z",
  facts: [{ name: "matlab.addons.install", status: "deprecated" as const, replacement: "mpminstall", source: "https://www.mathworks.com/help/matlab/ref/matlab.addons.install.html" }],
};

describe("share posts", () => {
  it("formats a code fact the way an agent can use it", () => {
    const [p] = sharePosts(ShareRequest.parse(codeReq));
    expect(p!.topic).toBe(SHARE_TOPIC);
    expect(p!.text).toBe(
      "[Studyhall verified · 2026-11-14] matlab.addons.install is deprecated (not recommended) in MATLAB R2026b → use mpminstall. Source: https://www.mathworks.com/help/matlab/ref/matlab.addons.install.html",
    );
    expect(p!.id).toMatch(/^sh-[0-9a-f]{32}$/);
    expect(sharePosts(ShareRequest.parse(codeReq))[0]!.id).toBe(p!.id); // stable on retry
  });

  it("rejects anything that isn't a verdict: code in an API name, non-https sources, current calls, too many facts", () => {
    expect(ShareRequest.safeParse({ ...codeReq, facts: [{ ...codeReq.facts[0], name: 'install("x"); delete(all)' }] }).success).toBe(false);
    expect(ShareRequest.safeParse({ ...codeReq, facts: [{ ...codeReq.facts[0], source: "http://example.com" }] }).success).toBe(false);
    expect(ShareRequest.safeParse({ ...codeReq, facts: [{ ...codeReq.facts[0], status: "current" }] }).success).toBe(false);
    expect(ShareRequest.safeParse({ ...codeReq, facts: Array(7).fill(codeReq.facts[0]) }).success).toBe(false);
  });

  it("claim posts carry what the sources say, never the pasted claim", () => {
    const body = shareBody({
      kind: "claim",
      receipts: {
        asOf: "2026-11-14T18:00:00.000Z",
        sources: [{ id: 1, url: "https://www.gov.uk/guidance/apply-for-an-electronic-travel-authorisation-eta" }],
        claims: [{ id: 1, text: "The UK ETA costs £16 per person.", quote: "the UK ETA costs **£16 per person**", verdict: "contradicted", sourcesSay: "GOV.UK says the ETA costs £20.", evidence: "e", sourceIds: [1] }],
      } as never,
    });
    const posts = sharePosts(ShareRequest.parse(body));
    expect(posts[0]!.text).toContain("GOV.UK says the ETA costs £20.");
    expect(posts[0]!.text).not.toContain("£16");
  });

  it("a code check shares only flagged calls with a source; nothing to share means no button", () => {
    const receipts = {
      app: "MATLAB",
      release: "R2026b",
      asOf: "2026-11-14T18:45:00.000Z",
      code: 'matlab.addons.install("secret.mltbx")',
      sources: [{ id: 1, url: "https://www.mathworks.com/help/matlab/ref/matlab.addons.install.html" }],
      calls: [
        { name: "matlab.addons.install", status: "deprecated", replacement: "mpminstall", sourceIds: [1] },
        { name: "readtable", status: "current", sourceIds: [1] },
      ],
    } as never;
    const body = shareBody({ kind: "code", receipts }) as { facts: { name: string }[] };
    expect(body.facts.map((f) => f.name)).toEqual(["matlab.addons.install"]);
    expect(JSON.stringify(body)).not.toContain("secret.mltbx");
    expect(shareBody({ kind: "code", receipts: { ...(receipts as object), calls: [] } as never })).toBeNull();
  });
});

describe("share config and passcode", () => {
  it("is on only with the flag, a token and a passcode", () => {
    expect(shareConfigFromEnv({ OPENCRAWL_SHARE_ENABLED: "true", OPENCRAWL_AGENT_TOKEN: "t", SHARE_PASSCODE: "p" }).enabled).toBe(true);
    expect(shareConfigFromEnv({ OPENCRAWL_SHARE_ENABLED: "true", OPENCRAWL_AGENT_TOKEN: "t" }).enabled).toBe(false);
    expect(shareConfigFromEnv({ OPENCRAWL_AGENT_TOKEN: "t", SHARE_PASSCODE: "p" }).enabled).toBe(false);
  });
  it("checks the passcode exactly", () => {
    expect(passcodeOk("team-pass", "team-pass")).toBe(true);
    expect(passcodeOk("team-pas", "team-pass")).toBe(false);
    expect(passcodeOk(null, "team-pass")).toBe(false);
  });
});

describe("postToBoard (mocked OpenCrawl MCP)", () => {
  it("discovers the workspace, then syncs the posts with the token, server-side", async () => {
    const calls: { name: string; args: Record<string, unknown>; auth: string | null }[] = [];
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      const msg = JSON.parse(String(init.body)) as { params: { name: string; arguments: Record<string, unknown> } };
      calls.push({ name: msg.params.name, args: msg.params.arguments, auth: new Headers(init.headers).get("authorization") });
      const text = msg.params.name === "board_topics" ? JSON.stringify({ workspace: "org_test" }) : JSON.stringify({ ok: true });
      return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }] } })}\n\n`, { status: 200 });
    });
    const cfg = shareConfigFromEnv({ OPENCRAWL_SHARE_ENABLED: "true", OPENCRAWL_AGENT_TOKEN: "tok", SHARE_PASSCODE: "p" });
    const r = await postToBoard(cfg, sharePosts(ShareRequest.parse(codeReq)), fetchFn as unknown as typeof fetch);
    expect(r).toEqual({ posted: 1, workspace: "org_test" });
    expect(calls.map((c) => c.name)).toEqual(["board_topics", "board_sync"]);
    expect(calls[1]!.args).toMatchObject({ workspace: "org_test", agent: "studyhall-share", topics: [SHARE_TOPIC] });
    expect(calls.every((c) => c.auth === "Bearer tok")).toBe(true);
  });

  it("reports an OpenCrawl error instead of claiming success", async () => {
    const fetchFn = vi.fn(async () => new Response("nope", { status: 401 }));
    const cfg = shareConfigFromEnv({ OPENCRAWL_SHARE_ENABLED: "true", OPENCRAWL_AGENT_TOKEN: "bad", SHARE_PASSCODE: "p" });
    await expect(postToBoard(cfg, sharePosts(ShareRequest.parse(codeReq)), fetchFn as unknown as typeof fetch)).rejects.toThrow(/HTTP 401/);
  });
});
