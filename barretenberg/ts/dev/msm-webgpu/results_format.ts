// Markdown formatters for the bench-nt-sweep JSON shape. Used by
// `scripts/format-m2-report.mjs` to convert the raw `--target macos`
// BrowserStack JSONL into the gisted report (pickNTM(logN) table +
// per-pass timing breakdown + speedup vs MsmV2 + crossover logN).
//
// The shape mirrors what `bench-nt-sweep.ts` parks on `window.__bench`
// and what the Playwright driver dumps to stdout: rows × cells.

export interface Cell {
  ntm: number;
  min: number;
  median: number;
  err: string | null;
  verifyOk?: boolean | null;
}

export interface Row {
  logN: number;
  bestNtm: number | null;
  msmV2Median: number | null;
  msmV2Err: string | null;
  cells: Cell[];
}

export interface SweepResult {
  state: "boot" | "running" | "done" | "error";
  error?: string | null;
  rows: Row[];
  summary?: Record<number, number>;
  crossover?: number | null;
  params?: Record<string, unknown>;
}

function rowsToNtmList(rows: Row[]): number[] {
  const set = new Set<number>();
  for (const r of rows) for (const c of r.cells) set.add(c.ntm);
  return [...set].sort((a, b) => a - b);
}

function fmt(x: number | null, digits = 2): string {
  return x === null || !Number.isFinite(x) ? "—" : x.toFixed(digits);
}

/**
 * Markdown of the `pickNTM` table for the gist. Columns: logN, every k in
 * the sweep, best k, MsmV2 baseline (ms), speedup ratio.
 */
export function renderPickNtmTable(result: SweepResult): string {
  const ntms = rowsToNtmList(result.rows);
  const head = [
    "| logN | " + ntms.map((k) => `k=${k}`).join(" | ") + " | best k | MsmV2 ms | speedup |",
    "|---|" + ntms.map(() => "---").join("|") + "|---|---|---|",
  ];
  const lines: string[] = [];
  for (const r of result.rows) {
    const cells = ntms.map((k) => {
      const c = r.cells.find((x) => x.ntm === k);
      if (!c) return "·";
      if (c.err) return "×";
      return fmt(c.median, 1);
    });
    const best =
      r.bestNtm === null
        ? "—"
        : `**k=${r.bestNtm}**`;
    const bestMedian = r.cells
      .filter((c) => !c.err)
      .reduce((m, c) => Math.min(m, c.median), Infinity);
    const speedup =
      r.msmV2Median !== null && bestMedian < Infinity && bestMedian > 0
        ? (r.msmV2Median / bestMedian).toFixed(2)
        : "—";
    lines.push(
      `| 2^${r.logN} | ${cells.join(" | ")} | ${best} | ${fmt(r.msmV2Median, 1)} | ${speedup} |`,
    );
  }
  return [...head, ...lines].join("\n");
}

/**
 * Markdown report compiled from the sweep result. Includes the pickNTM
 * table, the recommended `pickNTM(logN)` block, the MsmV2 crossover, and
 * a parameters footer.
 */
export function renderM2Report(result: SweepResult): string {
  const pickNtm: Record<number, number> = {};
  for (const r of result.rows) {
    if (r.bestNtm !== null) pickNtm[r.logN] = r.bestNtm;
  }
  const recommendation = Object.entries(pickNtm)
    .map(([logN, k]) => `${logN}: ${k}`)
    .join(", ");
  const crossover =
    result.crossover != null
      ? `MsmV2 overtakes TrivialMsm at logN=${result.crossover}.`
      : "MsmV2 does not overtake TrivialMsm within the swept range.";
  const params =
    result.params === undefined
      ? ""
      : "## Parameters\n\n```json\n" +
        JSON.stringify(result.params, null, 2) +
        "\n```\n";
  return `## M2 pickNTM(logN) — TrivialMsm vs MsmV2

### pickNTM table

${renderPickNtmTable(result)}

### Recommended \`pickNTM(logN)\`

\`{ ${recommendation} }\`

### Crossover

${crossover}

${params}`;
}
