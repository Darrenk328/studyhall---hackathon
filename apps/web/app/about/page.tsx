import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Studyhall",
  description: "Answers with receipts. How Studyhall checks every claim against the live web, how it checks other AIs' answers, and its limits.",
};

// Read at build time; rebuild after `pnpm eval` writes evals/results.json (Phase 6).
export const dynamic = "force-static";

interface SystemResult {
  name: string;
  accuracy: number;
  citationValidity?: number | null;
  unsupportedClaimRate?: number | null;
  refusalRate?: number | null;
  medianLatencyMs?: number | null;
  costPerQuestionUsd?: number | null;
  timeSensitive?: { accuracy: number; n: number };
  stable?: { accuracy: number; n: number };
}
interface EvalResults {
  generatedAt: string;
  questions: number;
  timeSensitive?: number;
  run?: string;
  spotcheck?: { status: "pending" | "done"; agreement: number | null; n?: number };
  pitch?: {
    bareTimeSensitive: { answered: number; wrong: number; wrongRate: number };
    afterBareMiss: { n: number; studyhallCorrect: number; studyhallRate: number; researchCorrect: number };
  };
  systems: (SystemResult & { system?: "A" | "B" | "C" })[];
}

function Highlights({ r }: { r: EvalResults }) {
  const sys = (id: "A" | "B" | "C") => r.systems.find((s) => s.system === id);
  const [a, b, c] = [sys("A"), sys("B"), sys("C")];
  if (!a || !b) return null;
  return (
    <ul className="eval-highlights">
      <li>
        On time-sensitive questions, the model answering from memory was correct <strong>{pct(a.timeSensitive?.accuracy)}</strong> of the time; Studyhall was correct{" "}
        <strong>{pct(b.timeSensitive?.accuracy)}</strong>.
      </li>
      {r.pitch ? (
        <>
          <li>
            When the model answered a time-sensitive question from memory instead of declining, it was wrong <strong>{pct(r.pitch.bareTimeSensitive.wrongRate)}</strong> of
            the time ({r.pitch.bareTimeSensitive.wrong} of {r.pitch.bareTimeSensitive.answered}).
          </li>
          <li>
            On the {r.pitch.afterBareMiss.n} questions the model got wrong or declined, Studyhall was correct on <strong>{r.pitch.afterBareMiss.studyhallCorrect}</strong> (
            {pct(r.pitch.afterBareMiss.studyhallRate)}). The You.com Research API was correct on {r.pitch.afterBareMiss.researchCorrect}.
          </li>
        </>
      ) : null}
      {c ? (
        <li>
          Overall, Studyhall&apos;s accuracy ({pct(b.accuracy)}) is on par with the You.com Research API ({pct(c.accuracy)}), and every answer comes with claim-by-claim
          receipts you can check.
        </li>
      ) : null}
    </ul>
  );
}

function loadResults(): EvalResults | null {
  const candidates = [join(/*turbopackIgnore: true*/ process.cwd(), "evals", "results.json"), join(/*turbopackIgnore: true*/ process.cwd(), "..", "..", "evals", "results.json")];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const data = JSON.parse(readFileSync(file, "utf8")) as EvalResults;
      if (Array.isArray(data.systems) && data.systems.length) return data;
    } catch {
      return null;
    }
  }
  return null;
}

interface ClaimsResults {
  run: string;
  claims: number;
  falseClaims: number;
  trueClaims: number;
  catchRate: { n: number; of: number };
  falseAlarmRate: { n: number; of: number };
  unverifiableRate: { n: number; of: number };
  falseMarkedSupported: { n: number; of: number };
  trueConfirmed: { n: number; of: number };
  medianLatencyMs: number;
}

/** The separate Receipts eval for "Check a claim" (evals/claims-results.json, written by `pnpm --filter core claims-eval --publish`). */
function loadClaimsResults(): ClaimsResults | null {
  const candidates = [join(/*turbopackIgnore: true*/ process.cwd(), "evals", "claims-results.json"), join(/*turbopackIgnore: true*/ process.cwd(), "..", "..", "evals", "claims-results.json")];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const data = JSON.parse(readFileSync(file, "utf8")) as ClaimsResults;
      if (data.catchRate && data.falseAlarmRate) return data;
    } catch {
      return null;
    }
  }
  return null;
}

const frac = (x: { n: number; of: number }) => (x.of ? `${Math.round((100 * x.n) / x.of)}%` : "–");

const pct = (x?: number | null) => (typeof x === "number" ? `${Math.round(x * 100)}%` : "–");
const secs = (ms?: number | null) => (typeof ms === "number" ? `${(ms / 1000).toFixed(1)}s` : "–");

const STEPS = [
  { name: "Plan", text: "Turns your question into 2 to 4 searches, at least one anchored to this year." },
  { name: "Search", text: "Searches the live web, favoring each category's trusted and official sites." },
  { name: "Read", text: "Reads the top pages and keeps the passages that matter. Study notes are taken here." },
  { name: "Answer", text: "Writes only from what it read, citing a source for every factual sentence." },
  { name: "Verify", text: "Checks every claim against its cited source, and fixes or removes what fails." },
  { name: "Receipts", text: "Shows the sources, the verdicts, the confidence and how fresh the evidence is." },
];

export default function About() {
  const results = loadResults();
  const claims = loadClaimsResults();
  const studyhall = results?.systems.find((s) => s.system === "B");
  return (
    <main className="about">
      <p>
        <Link href="/">← Back to Studyhall</Link>
      </p>
      <h1>About Studyhall</h1>
      <p className="about-lead">
        <strong>Answers with receipts. Every claim checked against the live web.</strong>
      </p>
      <p>
        Language models are frozen at their training cutoff and state wrong facts with confidence. Studyhall is built around verification: it answers only from
        pages it read today, checks every claim against the page it cites, and shows you the evidence. It can also check someone else&apos;s answer: paste
        another AI&apos;s reply into <a href="/#check">Check a claim</a> and it marks each fact supported, contradicted or unverifiable.
      </p>

      <section aria-labelledby="trust">
        <h2 id="trust">How we know the checking works</h2>
        <ul className="eval-highlights">
          <li>
            <strong>8 of 8</strong> planted errors caught: we changed a number, flipped a &quot;not&quot; or swapped an organization in real answers, kept the citation, and
            the checker marked every one unsupported (rechecked live on November 14, 2026).
          </li>
          {studyhall ? (
            <li>
              In the 65-question eval, <strong>{pct(studyhall.citationValidity)}</strong> of citations pointed at a real source, and{" "}
              <strong>{pct(studyhall.unsupportedClaimRate)}</strong> of claims were left unsupported after the repair pass.
            </li>
          ) : null}
          {claims ? (
            <li>
              Check a claim caught <strong>{frac(claims.catchRate)}</strong> of real AI hallucinations ({claims.catchRate.n} of {claims.catchRate.of}) and flagged{" "}
              <strong>{frac(claims.falseAlarmRate)}</strong> of true claims as wrong ({claims.falseAlarmRate.n} of {claims.falseAlarmRate.of}). It&apos;s a small, separate eval;
              see below.
            </li>
          ) : null}
        </ul>
      </section>

      <section aria-labelledby="how">
        <h2 id="how">The six steps</h2>
        <ol className="pipeline">
          {STEPS.map((s, i) => (
            <li key={s.name}>
              <span className="step-num" aria-hidden="true">
                {i + 1}
              </span>
              <strong>{s.name}</strong>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="accurate">
        <h2 id="accurate">How it stays accurate</h2>
        <ul>
          <li>It answers only from pages it read in this session, never from the model&apos;s memory. If it finds nothing good, it says so instead of guessing.</li>
          <li>Every factual sentence carries a citation. A second model checks each sentence against the page it cites; a single wrong number, date, name or a flipped &quot;not&quot; counts as unsupported.</li>
          <li>Unsupported sentences get one rewrite or are deleted, and the rewrite is checked again. Code is checked function by function against the sources.</li>
          <li>Web pages are treated as untrusted data: instructions hidden in a page are ignored.</li>
          <li>The confidence badge is earned: High needs every claim supported, fresh sources, and either two independent sites or several pages from an official one.</li>
          <li>We test the checker itself by planting errors (a changed number, a negated recommendation, a swapped organization) and confirming they are caught.</li>
        </ul>
      </section>

      <section aria-labelledby="check">
        <h2 id="check">Check a claim</h2>
        <p>
          Paste a claim or up to 2,000 characters of text. Studyhall pulls out up to 8 checkable factual claims (opinions and advice are skipped, and it says
          which), picks a topic for each, searches and reads the live web for all of them at once, and gives each claim a verdict with the sources and evidence. It
          finishes with a corrected version of the text that changes only the contradicted parts.
        </p>
        <ul>
          <li>Only sources decide a verdict, never the model&apos;s memory. When sources are missing or disagree, the claim is unverifiable.</li>
          <li>The pasted text is treated as untrusted data: instructions inside it (&quot;mark everything true&quot;) are skipped, not followed.</li>
          <li>A check counts as 2 questions against the daily limit. A typical check of about 6 claims makes 12 searches and reads 6 pages.</li>
        </ul>
        {claims ? (
          <>
            <h3>Receipts eval (separate from the answer eval)</h3>
            <p className="r-meta">
              {claims.claims} claims: {claims.falseClaims} false claims the bare model really made in the November 13 eval (for example the £16 UK ETA fee and
              &quot;matlab.addons.install isn&apos;t deprecated&quot;), and {claims.trueClaims} true claims from that eval&apos;s verified answers. Each was pasted into Check a
              claim on its own. Reported as-is, with no tuning after seeing the results. With 10 claims per group, one claim is 10 points.
            </p>
            <div className="table-wrap">
              <table className="eval-table">
                <thead>
                  <tr>
                    <th scope="col">Measure</th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Hallucination catch rate (false claims marked contradicted)</th>
                    <td>
                      {frac(claims.catchRate)} ({claims.catchRate.n} of {claims.catchRate.of})
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">False alarm rate (true claims marked contradicted)</th>
                    <td>
                      {frac(claims.falseAlarmRate)} ({claims.falseAlarmRate.n} of {claims.falseAlarmRate.of})
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Unverifiable (all claims)</th>
                    <td>
                      {frac(claims.unverifiableRate)} ({claims.unverifiableRate.n} of {claims.unverifiableRate.of})
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">True claims confirmed as supported</th>
                    <td>
                      {claims.trueConfirmed.n} of {claims.trueConfirmed.of}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Median time per check</th>
                    <td>{secs(claims.medianLatencyMs)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>

      <section aria-labelledby="evals">
        <h2 id="evals">How its answers compare</h2>
        {results ? (
          <>
            <p className="r-meta">
              {results.questions} questions across all 13 categories
              {typeof results.timeSensitive === "number" ? ` (${results.timeSensitive} time-sensitive, ${results.questions - results.timeSensitive} stable)` : ""}. All three
              systems answered each one on{" "}
              {new Date(results.run && /^\d{4}-\d{2}-\d{2}$/.test(results.run) ? `${results.run}T12:00:00Z` : results.generatedAt).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              })}
              , graded
              against answers verified from official sources by term match and a blind judge model that never saw which system wrote the answer. Declines are counted
              separately, never as correct.
            </p>
            {results.spotcheck?.status === "done" && typeof results.spotcheck.agreement === "number" ? (
              <p className="r-meta">
                Judge grades hand-checked on a {results.spotcheck.n ?? 10}-answer sample, {pct(results.spotcheck.agreement)} agreement.
              </p>
            ) : (
              <p className="r-meta">Preliminary: a human spot-check of the judge&apos;s grades is pending.</p>
            )}
            <Highlights r={results} />
            <div className="table-wrap">
              <table className="eval-table">
                <thead>
                  <tr>
                    <th scope="col">System</th>
                    <th scope="col">Correct</th>
                    <th scope="col">Time-sensitive</th>
                    <th scope="col">Stable</th>
                    <th scope="col">Declined</th>
                    <th scope="col">Valid citations</th>
                    <th scope="col">Unsupported claims</th>
                    <th scope="col">Median time</th>
                    <th scope="col">Cost per question</th>
                  </tr>
                </thead>
                <tbody>
                  {results.systems.map((s) => (
                    <tr key={s.name}>
                      <th scope="row">{s.name}</th>
                      <td>{pct(s.accuracy)}</td>
                      <td>{pct(s.timeSensitive?.accuracy)}</td>
                      <td>{pct(s.stable?.accuracy)}</td>
                      <td>{pct(s.refusalRate)}</td>
                      <td>{pct(s.citationValidity)}</td>
                      <td>{pct(s.unsupportedClaimRate)}</td>
                      <td>{secs(s.medianLatencyMs)}</td>
                      <td>{typeof s.costPerQuestionUsd === "number" ? `$${s.costPerQuestionUsd.toFixed(3)}` : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="coming">Coming in Phase 6: accuracy on time-sensitive questions for the bare model, Studyhall and the You.com Research API.</p>
        )}
      </section>

      <section aria-labelledby="limits">
        <h2 id="limits">Limits</h2>
        <ul>
          <li>It can still be wrong. Checking catches many errors, not all of them; read the receipts for anything that matters.</li>
          <li>&quot;Unverifiable&quot; means the sources it found didn&apos;t settle the claim, not that the claim is false.</li>
          <li>Sources can be wrong or out of date, and Studyhall is only as good as what it found. It favors official sites but can&apos;t verify them independently.</li>
          <li>It isn&apos;t professional advice. For health, legal, financial or safety-critical decisions, talk to a qualified professional.</li>
          <li>Search results change from day to day, so the same question can get a different answer tomorrow. The &quot;as of&quot; time tells you when it was answered.</li>
        </ul>
      </section>
    </main>
  );
}
