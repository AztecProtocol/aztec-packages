// Which tutorial and getting-started pages a test runs the typed commands of, and why each other page
// is not run. Keys are relative to a line's root (docs/ or docs/lines/<line>/), so one entry covers
// the page on every line. The install-free `bootstrap.sh check` reads this file, so it imports only
// node: modules and files under src/.
//
// `node scripts/page_tests.mts pages <runner>` prints the pages a runner tests, one per line, for
// examples/bootstrap.sh test_cmds; `test-page-transcript` runs the pages with steps.
import fs from "node:fs";
import { createRequire } from "node:module";

// Each step but `copy` and `check` binds the next block after the previous step's that contains its
// text: `run` a shell block, run as typed; `skip` a shell block, not run; `write` any other block,
// written to `to`; `merge` a TOML block, whose keys the file `into` lacks are added (a page that replaces
// a section uses `write`). `copy` takes a file from the line's examples/ that the page quotes in full,
// for the code a page assembles from regions. `check` runs a command the page does not type, labelled
// so in the log. A skip names the example the examples runner runs in its place (`runner`), or why it
// is not run, which leaves the page partly run unless it starts the local network.
export type Step =
  | { run: string }
  | { skip: string; runner: string }
  | { skip: string; why: string }
  | { write: string; to: string }
  | { merge: string; into: string }
  | { copy: string; to: string }
  | { check: string; why: string };
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
  "docs-developers/docs/tutorials/js_tutorials/token_bridge.md": {
    steps: [
      { run: "mkdir aztec-nft-bridge" },
      { write: "package.json", to: "package.json" },
      { write: ".yarnrc.yml", to: ".yarnrc.yml" },
      { run: "yarn add hardhat" },
      { run: "ln -sfn" },
      { copy: "ts/token_bridge/hardhat.config.ts", to: "hardhat.config.ts" },
      { copy: "ts/token_bridge/remappings.txt", to: "remappings.txt" },
      { skip: "aztec start --local-network", why: "starts the local network, which only the script needs" },
      { run: "aztec new contracts/aztec/nft" },
      { run: "touch nft_contract/src/nft.nr" },
      { copy: "contracts/nft/src/nft.nr", to: "nft_contract/src/nft.nr" },
      { copy: "contracts/nft/src/main.nr", to: "nft_contract/src/main.nr" },
      { write: "Tests are out of scope", to: "nft_test/src/lib.nr" },
      { run: "aztec compile" },
      { run: "aztec new nft_bridge" },
      { merge: "NFTPunk", into: "nft_bridge_contract/Nargo.toml" },
      { copy: "contracts/nft_bridge/src/main.nr", to: "nft_bridge_contract/src/main.nr" },
      { write: "Tests are out of scope", to: "nft_bridge_test/src/lib.nr" },
      { run: "aztec compile" },
      { run: "aztec codegen target" },
      { run: "touch contracts/SimpleNFT.sol" },
      { copy: "ts/token_bridge/contracts/SimpleNFT.sol", to: "contracts/SimpleNFT.sol" },
      { run: "touch contracts/NFTPortal.sol" },
      { copy: "ts/token_bridge/contracts/NFTPortal.sol", to: "contracts/NFTPortal.sol" },
      { run: "npx hardhat compile" },
      { run: "mkdir -p scripts" },
      { copy: "ts/token_bridge/scripts/index.ts", to: "scripts/index.ts" },
      {
        check:
          "yarn add -D typescript@5.9.3\nnpx tsc --noEmit --target es2022 --module nodenext --moduleResolution nodenext --esModuleInterop --skipLibCheck --resolveJsonModule --lib dom,esnext scripts/index.ts",
        why: "type-checks the script against the generated bindings and the Hardhat artifacts",
      },
      { skip: "npx tsx scripts/index.ts", runner: "token_bridge" },
    ],
  },
  "docs-developers/docs/tutorials/contract_tutorials/token_contract.md": {
    steps: [
      { run: "aztec new bob_token" },
      { write: "Tests are out of scope", to: "bob_token_test/src/lib.nr" },
      { merge: "bob_token_contract", into: "bob_token_contract/Nargo.toml" },
      { skip: "aztec compile", why: "the first build, of the contract's public half, which no example file holds" },
      { skip: "aztec codegen target --outdir artifacts", why: "the bindings of that public half" },
      { skip: "aztec start --local-network", why: "starts the local network, which only the script needs" },
      { skip: "npx tsx index.ts", why: "deploys that public half" },
      { merge: "balance_set", into: "bob_token_contract/Nargo.toml" },
      { copy: "contracts/bob_token_contract/src/main.nr", to: "bob_token_contract/src/main.nr" },
      { run: "aztec compile" },
      { skip: "aztec start --local-network", why: "starts the local network, which only the script needs" },
      { copy: "ts/bob_token_contract/index.ts", to: "index.ts" },
      {
        check:
          "yarn add -D typescript@5.9.3\nnpx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --lib dom,esnext index.ts",
        why: "type-checks the script against the generated bindings and the packages the page installs",
      },
      { skip: "npx tsx index.ts", runner: "bob_token_contract" },
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
  "docs-developers/docs/tutorials/contract_tutorials/token_contract.md":
    "its first build, bindings and deployment, of the contract's public half, are not run: no example file holds that half",
  "docs-developers/docs/tutorials/js_tutorials/aave_bridge.md": "no transcript test yet",
  "docs-developers/docs/tutorials/js_tutorials/aztecjs-getting-started.md":
    "installs with Yarn's default PnP linker and its script needs a running network",
  "docs-developers/docs/tutorials/js_tutorials/first_full_project.md":
    "its runner types its own copy of the commands, so a changed command is not run; `npm start` needs a running network",
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

const SHELL = /^(bash|sh|shell|zsh|console|powershell|pwsh|terminal)\b/;

export const isShell = (b: Block) => SHELL.test(b.info);

// Code blocks the site renders that `blocks` does not return: fenced inside a blockquote, or a JSX
// <CodeBlock>. A shell file pulled in by #include_code is found with the site's own directive pattern.
const UNREAD = /^\s*(>\s*)+(```|~~~)|<CodeBlock\b/;

// src/preprocess/include_code.js, loaded on first use.
const includeCode = () =>
  createRequire(import.meta.url)("../src/preprocess/include_code.js") as {
    includeCodeDirective: RegExp;
    extractCodeSnippet(file: string, name: string): [string, number, number];
  };

// Each #include_code directive in a text, matched as the site's preprocessor matches it.
const directives = (text: string) => {
  const { source, flags } = includeCode().includeCodeDirective;
  return [...text.matchAll(new RegExp(source, flags))];
};

/** The 1-based lines of a markdown text holding a code block the census cannot read. */
export function unread(text: string): number[] {
  const lineAt = (index: number) => text.slice(0, index).split("\n").length;
  const included = directives(text).filter((m) => SHELL.test(m[3])).map((m) => lineAt(m.index));
  const rows = text.split("\n").flatMap((row, i) => (UNREAD.test(row) ? [i + 1] : []));
  return [...new Set([...rows, ...included])].sort((x, y) => x - y);
}

const FITS = { run: isShell, skip: isShell, write: (b: Block) => !isShell(b), merge: (b: Block) => /^toml\b/.test(b.info) };
type Kind = keyof typeof FITS;

function binding(step: Step): [Kind, string] | undefined {
  if ("run" in step) return ["run", step.run];
  if ("skip" in step) return ["skip", step.skip];
  if ("write" in step) return ["write", step.write];
  if ("merge" in step) return ["merge", step.merge];
  return undefined;
}

function targetErrors(step: Step): string[] {
  const target = "to" in step ? step.to : "into" in step ? step.into : "";
  const escapes = target.startsWith("/") || target.split("/").includes("..");
  return escapes ? [`${target}: a target is relative, without ..`] : [];
}

/** The reasons a spec's skips leave its page partly run: every skip but the runner's and the local network's. */
export const partlyRun = (steps: Step[]): string[] =>
  steps.flatMap((s) => ("skip" in s && "why" in s && !/^aztec start( --[\w-]+)*$/.test(s.skip) ? [s.why] : []));

// A shell block's commands, without blank and comment lines, for a skip, which must name all of them.
const commands = (b: Block) =>
  b.body
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .join("\n");

function holds(b: Block, kind: Kind, text: string): boolean {
  if (kind === "skip") return commands(b) === text;
  return b.body.join("\n").includes(text) || (kind === "write" && b.info.includes(text));
}

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
      errors.push(`${page[next - 1]?.line ?? 1}: no ${kind} block after this line ${kind === "skip" ? "is exactly" : "contains"} ${JSON.stringify(text)}`);
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
  const covered = new Set<number>();
  for (const [, name, file] of directives(page)) {
    if (file !== `/${rel}`) continue;
    const [, start, end] = includeCode().extractCodeSnippet(source, name);
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
