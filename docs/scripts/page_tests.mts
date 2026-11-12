// Which tutorial and getting-started pages a test runs the typed commands of, and why each other page
// is not run. Keys are relative to a line's root (docs/ or docs/lines/<line>/), so one entry covers
// the page on every line. The install-free `bootstrap.sh check` reads this file, so it imports only
// node: modules and src/markdown_fences.js.
//
// `node scripts/page_tests.mts pages <runner>` prints the pages a runner tests, one per line, for
// examples/bootstrap.sh test_cmds.
import { createRequire } from "node:module";

export type Block = { line: number; info: string; body: string[] };
export type Transcript = { runner: "test-first-project" | "test-fresh-clone" };

export const TRANSCRIPTS: Record<string, Transcript> = {
  "docs-developers/docs/tutorials/js_tutorials/first_full_project.md": { runner: "test-first-project" },
  "docs-developers/docs/tutorials/js_tutorials/webapp/index.md": { runner: "test-fresh-clone" },
  "docs-developers/docs/tutorials/js_tutorials/uniswap_swap.md": { runner: "test-fresh-clone" },
};

// Shrink-only: a page leaves this list when a test runs its commands, and never joins it to get a
// failing test green. A page in both lists is partly run; its reason names what is not.
export const UNTESTED: Record<string, string> = {
  "docs-developers/docs/tutorials/contract_tutorials/counter_contract.md": "no transcript test yet",
  "docs-developers/docs/tutorials/contract_tutorials/recursive_verification.md":
    "needs aztec-nargo from the installer, proof generation and a running network",
  "docs-developers/docs/tutorials/contract_tutorials/token_contract.md": "no transcript test yet",
  "docs-developers/docs/tutorials/js_tutorials/aave_bridge.md": "no transcript test yet",
  "docs-developers/docs/tutorials/js_tutorials/aztecjs-getting-started.md":
    "installs with Yarn's default PnP linker and its script needs a running network",
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

export const isShell = (b: Block) => /^(bash|sh|shell|zsh|console)\b/.test(b.info);

if (import.meta.main) {
  const [mode, runner] = process.argv.slice(2);
  if (mode !== "pages" || !runner) {
    console.error("usage: page_tests.mts pages <runner>");
    process.exit(2);
  }
  const pages = Object.entries(TRANSCRIPTS).filter(([, t]) => t.runner === runner).map(([page]) => page);
  if (!pages.length) {
    console.error(`page_tests.mts: no page uses runner ${runner}`);
    process.exit(1);
  }
  console.log(pages.join("\n"));
}
