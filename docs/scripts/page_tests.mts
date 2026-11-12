// Which tutorial and getting-started pages a test runs the typed commands of, and why each other page
// is not run. Keys are relative to a line's root (docs/ or docs/lines/<line>/), so one entry covers
// the page on every line. The install-free `bootstrap.sh check` reads this file, so it imports only
// node: modules and files under src/.
//
// `node scripts/page_tests.mts pages <runner>` prints the pages a runner tests, one per line, for
// examples/bootstrap.sh test_cmds; `test-page-transcript` runs the pages with steps.
import fs from "node:fs";
import { createRequire } from "node:module";

// Each step but `copy` binds the next block after the previous step's that contains its text: `run` a
// shell block, run as typed; `write` any other block, written to `to`; `merge` a TOML block, whose keys
// the file `into` lacks are added (a page that replaces a section uses `write`). `copy` takes a file
// from the line's examples/ that the page quotes in full, for the code a page assembles from regions.
export type Step = { run: string } | { write: string; to: string } | { merge: string; into: string } | { copy: string; to: string };
export type Transcript = { runner: "test-first-project" | "test-fresh-clone" } | { steps: Step[] };
export type Block = { line: number; info: string; body: string[] };
export type Bound = { step: Step; block?: Block };

export const TRANSCRIPTS: Record<string, Transcript> = {
  "docs-developers/docs/tutorials/contract_tutorials/counter_contract.md": {
    steps: [
      { run: "aztec new counter" },
      { merge: "balance_set", into: "counter_contract/Nargo.toml" },
      { write: "Tests are out of scope", to: "counter_test/src/lib.nr" },
      { copy: "contracts/counter_contract/src/main.nr", to: "counter_contract/src/main.nr" },
      { run: "aztec compile" },
      { run: "aztec codegen" },
    ],
  },
  "docs-developers/docs/tutorials/js_tutorials/first_full_project.md": { runner: "test-first-project" },
  "docs-developers/docs/tutorials/js_tutorials/webapp/index.md": { runner: "test-fresh-clone" },
  "docs-developers/docs/tutorials/js_tutorials/uniswap_swap.md": { runner: "test-fresh-clone" },
};

// Shrink-only: a page leaves this list when a test runs its commands, and never joins it to get a
// failing test green. A page in both lists is partly run; its reason names what is not.
export const UNTESTED: Record<string, string> = {
  "docs-developers/docs/tutorials/contract_tutorials/recursive_verification.md":
    "needs aztec-nargo from the installer, proof generation and a running network",
  "docs-developers/docs/tutorials/contract_tutorials/token_contract.md": "no transcript test yet",
  "docs-developers/docs/tutorials/js_tutorials/aave_bridge.md": "no transcript test yet",
  "docs-developers/docs/tutorials/js_tutorials/aztecjs-getting-started.md":
    "installs with Yarn's default PnP linker and its script needs a running network",
  "docs-developers/docs/tutorials/js_tutorials/first_full_project.md":
    "its runner types its own copy of the commands, so a changed command is not run; `npm start` needs a running network",
  "docs-developers/docs/tutorials/js_tutorials/token_bridge.md": "no transcript test yet",
  "docs-developers/docs/tutorials/js_tutorials/uniswap_swap.md":
    "the clone test does not run the npm install block; the network run needs a local network",
  "docs-developers/docs/tutorials/js_tutorials/wallet-extension/01-architecture.md":
    "builds inside the webapp clone; the webapp clone test runs the same build",
  "docs-developers/docs/tutorials/js_tutorials/wallet-extension/06-approval-ui.md":
    "builds inside the webapp clone; the webapp clone test runs the same build",
  "docs-developers/docs/tutorials/js_tutorials/wallet-extension/07-testing.md":
    "runs inside the webapp clone and needs a dev server and a browser",
  "docs-developers/docs/tutorials/js_tutorials/wallet-extension/index.md":
    "builds inside the webapp clone; the webapp clone test runs the same build",
  "docs-developers/docs/tutorials/js_tutorials/webapp/01-the-contract.md":
    "runs inside the webapp clone and needs a running network",
  "docs-developers/docs/tutorials/js_tutorials/webapp/02-project-setup.md": "runs inside the webapp clone",
  "docs-developers/docs/tutorials/js_tutorials/webapp/03-network-and-wallet.md":
    "builds inside the webapp clone; the webapp clone test runs the same build",
  "docs-developers/docs/tutorials/js_tutorials/webapp/06-putting-it-together.md":
    "runs inside the webapp clone and needs a running network and a dev server",
  "docs-developers/docs/tutorials/js_tutorials/webapp/07-testing-the-contract.md":
    "runs inside the webapp clone and needs the TXE",
  "docs-developers/docs/tutorials/js_tutorials/webapp/wallet-sdk/01-dapp-integration.md":
    "an install into the reader's own app; the page names no project to run it in",
  "docs-developers/docs/tutorials/testing_governance_rollup_upgrade.md":
    "needs a running network and a governance vote",
  "docs-developers/getting_started_on_local_network.md": "needs the installer and a running network",
  "docs-developers/getting_started_on_testnet.md": "needs the installer, testnet access and a funded account",
};

const fences = createRequire(import.meta.url)("../src/markdown_fences.js") as {
  fenceBlocks(lines: string[]): Block[];
};

/** The fenced code blocks of a markdown text, as src/markdown_fences.js finds them. */
export const blocks = (text: string): Block[] => fences.fenceBlocks(text.split("\n"));

const SHELL = "bash|sh|shell|zsh|console|powershell|pwsh|terminal";

export const isShell = (b: Block) => new RegExp(`^(${SHELL})\\b`).test(b.info);

// Code blocks the site renders that `blocks` does not return: fenced inside a blockquote, a shell file
// pulled in by #include_code, or a JSX <CodeBlock>.
const UNREAD = new RegExp(`^\\s*(>\\s*)+(\`\`\`|~~~)|^\\s*#include_code\\s+\\S+\\s+\\S+\\s+(${SHELL})\\b|<CodeBlock\\b`);

/** The 1-based lines of a markdown text holding a code block the census cannot read. */
export const unread = (text: string): number[] => text.split("\n").flatMap((row, i) => (UNREAD.test(row) ? [i + 1] : []));

const FITS = { run: isShell, write: (b: Block) => !isShell(b), merge: (b: Block) => /^toml\b/.test(b.info) };
type Kind = keyof typeof FITS;

function binding(step: Step): [Kind, string] | undefined {
  if ("run" in step) return ["run", step.run];
  if ("write" in step) return ["write", step.write];
  if ("merge" in step) return ["merge", step.merge];
  return undefined;
}

function targetErrors(step: Step): string[] {
  const target = "to" in step ? step.to : "into" in step ? step.into : "";
  const escapes = target.startsWith("/") || target.split("/").includes("..");
  return escapes ? [`${target}: a target is relative, without ..`] : [];
}

const holds = (b: Block, kind: Kind, text: string) => b.body.join("\n").includes(text) || (kind === "write" && b.info.includes(text));

/**
 * Binds each step to its block, one cursor over the blocks in page order. A shell block the cursor
 * passes, or leaves after the last step, is an error: every command the page types is run.
 *
 * @returns the bound steps, and `<line>: <reason>` errors
 */
export function walk(page: Block[], steps: Step[]): { bound: Bound[]; errors: string[] } {
  const bound: Bound[] = [];
  const errors: string[] = [];
  let next = 0;
  const unrun = (until: number) => page.slice(next, until).filter(isShell).map((b) => `${b.line}: shell block not run`);
  for (const step of steps) {
    errors.push(...targetErrors(step));
    const bind = binding(step);
    if (!bind) {
      bound.push({ step });
      continue;
    }
    const [kind, text] = bind;
    const at = page.findIndex((b, i) => i >= next && FITS[kind](b) && holds(b, kind, text));
    if (at < 0) {
      errors.push(`${page[next - 1]?.line ?? 1}: no ${kind} block after this line contains ${JSON.stringify(text)}`);
      continue;
    }
    errors.push(...unrun(at));
    bound.push({ step, block: page[at] });
    next = at + 1;
  }
  errors.push(...unrun(page.length));
  return { bound, errors };
}

/**
 * The lines of `source` that no region the page `#include_code`s quotes. Blank lines, region markers
 * and lines of only closing brackets need no quote. An empty result proves the page shows every line
 * of the file a `copy` step takes, not that its regions, assembled as the page says, form the file.
 *
 * @param source the file's path; `rel` is that path as the page's `#include_code` names it, without the leading slash
 */
export function uncovered(page: string, source: string, rel: string): number[] {
  const { extractCodeSnippet } = createRequire(import.meta.url)("../src/preprocess/include_code.js") as {
    extractCodeSnippet(file: string, name: string): [string, number, number];
  };
  const covered = new Set<number>();
  for (const [, name, file] of page.matchAll(/^\s*#include_code\s+(\S+)\s+\/(\S+)/gm)) {
    if (file !== rel) continue;
    const [, start, end] = extractCodeSnippet(source, name);
    for (let n = start + 1; n < end; n++) covered.add(n);
  }
  return fs
    .readFileSync(source, "utf8")
    .split("\n")
    .flatMap((row, i) => (covered.has(i + 1) || /^[\s)\]};]*$|docs:(start|end):/.test(row) ? [] : [i + 1]));
}

if (import.meta.main) {
  const [mode, runner] = process.argv.slice(2);
  if (mode !== "pages" || !runner) {
    console.error("usage: page_tests.mts pages <runner>");
    process.exit(2);
  }
  const runs = (t: Transcript) => ("runner" in t ? t.runner : "test-page-transcript") === runner;
  const pages = Object.entries(TRANSCRIPTS).filter(([, t]) => runs(t)).map(([page]) => page);
  if (!pages.length) {
    console.error(`page_tests.mts: no page uses runner ${runner}`);
    process.exit(1);
  }
  console.log(pages.join("\n"));
}
