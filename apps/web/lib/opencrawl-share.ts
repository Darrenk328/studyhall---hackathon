/**
 * "Share with my team's agents": post verified facts from a finished Check my code or Check a
 * claim to the team's OpenCrawl board, so the team's coding agents find current, cited facts.
 *
 * Server-side only. Posts carry ONLY verdicts, replacements, citations and dates: never the
 * pasted code or text. For claims, the text posted is what the sources say, not the claim.
 * The agent token never leaves the server.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const SHARE_TOPIC = "verified-api-facts";
export const SHARE_AGENT = "studyhall-share";
/** At most this many facts per share (the board takes 3 posts per sync). */
export const MAX_SHARE_FACTS = 6;
const MAX_POST_CHARS = 512;

export interface ShareConfig {
  enabled: boolean;
  token?: string;
  passcode?: string;
  apiUrl: string;
}

export function shareConfigFromEnv(env: Record<string, string | undefined> = process.env): ShareConfig {
  const token = env.OPENCRAWL_AGENT_TOKEN?.trim() || undefined;
  const passcode = env.SHARE_PASSCODE?.trim() || undefined;
  return {
    enabled: env.OPENCRAWL_SHARE_ENABLED === "true" && Boolean(token) && Boolean(passcode),
    ...(token ? { token } : {}),
    ...(passcode ? { passcode } : {}),
    apiUrl: (env.OPENCRAWL_API_URL?.trim() || "https://app.getopencrawl.com").replace(/\/+$/, ""),
  };
}

/** Constant-time passcode check. */
export function passcodeOk(given: string | null | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------- request and post text

const url = z.string().url().max(400).refine((u) => u.startsWith("https://"), "https only");
const shortText = (n: number) => z.string().trim().min(1).max(n);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/);

/** Code facts: an API name, its status, and the documented replacement. */
const CodeFact = z.object({
  name: z.string().trim().min(1).max(120).regex(/^[\w.]+$/, "an API name"),
  status: z.enum(["deprecated", "removed"]),
  replacement: z.string().trim().max(160).optional(),
  source: url,
});
/** Claim facts: only what the sources say (never the pasted claim). */
const ClaimFact = z.object({
  verdict: z.enum(["supported", "contradicted"]),
  sourcesSay: shortText(300),
  source: url,
});

export const ShareRequest = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("code"), app: shortText(60), release: shortText(60), checkedAt: isoDate, facts: z.array(CodeFact).min(1).max(MAX_SHARE_FACTS) }),
  z.object({ kind: z.literal("claim"), checkedAt: isoDate, facts: z.array(ClaimFact).min(1).max(MAX_SHARE_FACTS) }),
]);
export type ShareRequest = z.infer<typeof ShareRequest>;

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** One line per fact, in a format a coding agent can act on. Built here from validated fields only. */
export function sharePosts(req: ShareRequest): { id: string; topic: string; text: string }[] {
  const date = req.checkedAt.slice(0, 10);
  const lines =
    req.kind === "code"
      ? req.facts.map((f) => {
          const status = f.status === "deprecated" ? "deprecated (not recommended)" : "removed";
          const use = f.replacement ? ` → use ${oneLine(f.replacement)}` : "";
          return `[Studyhall verified · ${date}] ${f.name} is ${status} in ${oneLine(req.app)} ${oneLine(req.release)}${use}. Source: ${f.source}`;
        })
      : req.facts.map((f) => `[Studyhall verified · ${date}] ${f.verdict === "contradicted" ? "Correction, per the sources" : "Confirmed by the sources"}: ${oneLine(f.sourcesSay)} Source: ${f.source}`);
  return lines.map((text) => {
    const t = clip(text, MAX_POST_CHARS);
    // A stable id: retrying the same fact reuses it, and the board rejects a changed retry.
    return { id: `sh-${createHash("sha256").update(t).digest("hex").slice(0, 32)}`, topic: SHARE_TOPIC, text: t };
  });
}

// ---------------------------------------------------------------- posting (OpenCrawl MCP over HTTP)

export class ShareError extends Error {}

async function rpc(cfg: ShareConfig, fetchFn: typeof fetch, name: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetchFn(`${cfg.apiUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${cfg.token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new ShareError(`OpenCrawl ${name} failed: HTTP ${res.status}`);
  let body = await res.text();
  if (/^\s*(event:|data:)/.test(body)) body = body.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
  const msg = JSON.parse(body) as { result?: { content?: { text?: string }[]; isError?: boolean }; error?: { message?: string } };
  if (msg.error || msg.result?.isError) throw new ShareError(`OpenCrawl ${name} failed: ${msg.error?.message ?? msg.result?.content?.[0]?.text ?? "error"}`);
  const text = msg.result?.content?.[0]?.text ?? "{}";
  try {
    return JSON.parse(text.split("\n")[0]!);
  } catch {
    return {};
  }
}

/** Post the facts to the team's board: discover the workspace, then sync in batches of 3. */
export async function postToBoard(cfg: ShareConfig, posts: { id: string; topic: string; text: string }[], fetchFn: typeof fetch = fetch): Promise<{ posted: number; workspace: string }> {
  if (!cfg.token) throw new ShareError("Sharing isn't configured.");
  const topics = (await rpc(cfg, fetchFn, "board_topics", {})) as { workspace?: string };
  if (!topics.workspace) throw new ShareError("OpenCrawl didn't return a workspace.");
  let posted = 0;
  for (let i = 0; i < posts.length; i += 3) {
    await rpc(cfg, fetchFn, "board_sync", { workspace: topics.workspace, agent: SHARE_AGENT, topics: [SHARE_TOPIC], posts: posts.slice(i, i + 3) });
    posted += posts.slice(i, i + 3).length;
  }
  return { posted, workspace: topics.workspace };
}
