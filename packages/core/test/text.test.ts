import { describe, expect, it } from "vitest";
import {
  chunkText,
  citedIds,
  cleanMarkdown,
  domainOf,
  humanAge,
  keywords,
  matchesDomain,
  normalizeUrl,
  sanitizeCitations,
  selectRelevant,
} from "../src/pipeline/text.js";

describe("normalizeUrl (dedupe key)", () => {
  it("ignores scheme, www, case of host, trailing slash, fragment and tracking params", () => {
    const a = normalizeUrl("https://www.CDC.gov/flu/vaccines/?utm_source=x&b=2&a=1#top");
    const b = normalizeUrl("http://cdc.gov/flu/vaccines?a=1&b=2&fbclid=zzz");
    expect(a).toBe(b);
  });
  it("collapses MathWorks country mirrors and its s_tid search tag (seen in a live MATLAB run)", () => {
    const page = "https://www.mathworks.com/matlabcentral/answers/2185220-x";
    expect(normalizeUrl("https://in.mathworks.com/matlabcentral/answers/2185220-x")).toBe(normalizeUrl(page));
    expect(normalizeUrl(`${page}?s_tid=srchtitle`)).toBe(normalizeUrl(page));
    expect(normalizeUrl("https://de.wikipedia.org/wiki/Paris")).not.toBe(normalizeUrl("https://en.wikipedia.org/wiki/Paris"));
  });
  it("treats bare utm and CDC referral tags as tracking (seen in live CDC results)", () => {
    const page = "https://www.cdc.gov/covid/hcp/vaccine-considerations/routine-guidance.html";
    expect(normalizeUrl("https://cdc.gov/covid/hcp/vaccine-considerations/routine-guidance.html?utm=")).toBe(normalizeUrl(page));
    expect(normalizeUrl(`${page}?CDC_AA_refVal=https%3A%2F%2Fwww.cdc.gov%2Fold`)).toBe(normalizeUrl(page));
  });

  it("keeps meaningful query params and path case", () => {
    expect(normalizeUrl("https://a.com/x?id=1")).not.toBe(normalizeUrl("https://a.com/x?id=2"));
    expect(normalizeUrl("https://a.com/Page")).not.toBe(normalizeUrl("https://a.com/page"));
  });
});

describe("domains", () => {
  it("matches subdomains but not lookalikes", () => {
    expect(matchesDomain("ncbi.nlm.nih.gov", "nih.gov")).toBe(true);
    expect(matchesDomain("nih.gov", "nih.gov")).toBe(true);
    expect(matchesDomain("notnih.gov", "nih.gov")).toBe(false);
    expect(domainOf("https://www.who.int/news")).toBe("who.int");
  });
});

describe("citations", () => {
  it("extracts [n], [n][m] and [n, m] but not markdown links", () => {
    expect(citedIds("A [1]. B [2][4]. C [3, 5]. See [docs](https://x.test) and [7](https://y.test).")).toEqual([1, 2, 3, 4, 5]);
  });

  it("removes citation numbers that match no source and tidies punctuation", () => {
    const r = sanitizeCitations("Rate is 4% [1][9]. Other fact [12]. Mixed [2, 12].", new Set([1, 2]));
    expect(r.text).toBe("Rate is 4% [1]. Other fact. Mixed [2].");
    expect(r.removed).toEqual([9, 12]);
  });

  it("leaves valid text untouched", () => {
    const t = "All good [1][2].";
    expect(sanitizeCitations(t, new Set([1, 2]))).toEqual({ text: t, removed: [] });
  });
});

describe("chunking and relevance", () => {
  const page = cleanMarkdown(
    [
      "# Flu vaccine guidance ![logo](x.png)",
      "Everyone 6 months and older should get a flu vaccine every season.",
      "Our [newsletter](https://x.test) has recipes and unrelated updates. ".repeat(20),
      "People 65 and older should get a higher-dose flu vaccine, according to the 2026 guidance.",
    ].join("\n\n"),
  );

  it("cleans images and link targets", () => {
    expect(page).not.toContain("x.png");
    expect(page).toContain("Our newsletter has");
  });

  it("splits long paragraphs without dropping text", () => {
    const long = "word ".repeat(1000).trim();
    const chunks = chunkText(long, 200);
    expect(chunks.join(" ").replace(/\s+/g, " ").length).toBe(long.length);
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(400);
  });

  it("keeps the lead and the relevant chunks, dropping filler, in original order", () => {
    const out = selectRelevant(page, "Who should get a higher-dose flu vaccine?", 600);
    expect(out.startsWith("# Flu vaccine guidance")).toBe(true);
    expect(out).toContain("higher-dose");
    expect(out).not.toContain("recipes");
    expect(out.length).toBeLessThanOrEqual(700);
  });

  it("keywords drop stopwords", () => {
    expect(keywords("What is the current Node.js LTS version?")).toEqual(["node.js", "lts", "version"]);
  });
});

describe("humanAge", () => {
  it("formats ages", () => {
    expect(humanAge(30_000)).toBe("just now");
    expect(humanAge(2 * 3_600_000)).toBe("2 hours old");
    expect(humanAge(86_400_000)).toBe("1 day old");
    expect(humanAge(40 * 86_400_000)).toBe("1 month old");
  });
});

describe("sentences and spans", () => {
  it("splits on sentence ends and line breaks, keeps trailing citations, ignores decimals", async () => {
    const { splitSentences } = await import("../src/pipeline/text.js");
    const text = "The range is 3.75% to 4.00% [1][2]. It held in October [3].\n\n- Adults 65+ get 2 doses [1].\n1. Second item here.";
    expect(splitSentences(text).map((s) => s.text)).toEqual([
      "The range is 3.75% to 4.00% [1][2].",
      "It held in October [3].",
      "- Adults 65+ get 2 doses [1].",
      "1. Second item here.",
    ]);
    for (const s of splitSentences(text)) expect(text.slice(s.start, s.end)).toBe(s.text);
  });

  it("locateSpan matches exactly, then tolerates whitespace differences", async () => {
    const { locateSpan } = await import("../src/pipeline/text.js");
    const text = "First [1]. Second  sentence\nwraps [2].";
    expect(locateSpan(text, "First [1].")).toEqual({ start: 0, end: 10 });
    const s = locateSpan(text, "Second sentence wraps [2].")!;
    expect(text.slice(s.start, s.end)).toBe("Second  sentence\nwraps [2].");
    expect(locateSpan(text, "Not here.")).toBeNull();
  });
});

describe("source dates (Fix 2)", () => {
  it("page_age without a zone is read as UTC, so the date part is exactly what the source states", async () => {
    const { parsePageAge } = await import("../src/providers/you.js");
    expect(parsePageAge("2026-10-28T23:59:00")!.toISOString().slice(0, 10)).toBe("2026-10-28");
    expect(parsePageAge("2026-10-29T00:01:00")!.toISOString().slice(0, 10)).toBe("2026-10-29");
  });
});
