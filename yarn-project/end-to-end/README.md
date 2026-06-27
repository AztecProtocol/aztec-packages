# End-to-end tests

This package holds Aztec's end-to-end (e2e) tests: full-stack scenarios that spin up an Aztec node (or
several), a PXE, and an L1 (anvil) and exercise the system the way a real deployment would. It is the
integration layer above the per-package unit tests.

> **Two audiences.** The top of this document is a quick orientation for humans. The
> [Reference for agents](#reference-for-agents) section at the bottom is the detailed, exhaustive
> version — read that when you are placing, moving, or wiring up a test.

## Quick start

Run a single test (spawns its own in-process anvil):

```bash
yarn test:e2e src/automine/token/access_control.parallel.test.ts
yarn test:e2e src/single-node/block-building/block_building.test.ts -t 'rejects double spend'
```

Turn up logging with `LOG_LEVEL` (`verbose` is the useful default; `debug:sequencer,archiver` scopes it):

```bash
LOG_LEVEL=verbose yarn test:e2e src/single-node/proving/empty_blocks.test.ts
```

Compose-based tests (those under `src/composed/`) need a running local network — see
[Compose / HA / web3signer tests](#compose--ha--web3signer-tests).

## Test categories

Tests are grouped by **node topology** — the shape of the network a test needs. The top-level folder is
the category; the second level names the behavior under test. Each category owns a base class that builds
its environment, so a test file only describes the scenario, not the wiring.

| Category | Topology | A test belongs here when… | README |
|---|---|---|---|
| [`automine/`](src/automine/README.md) | One node, deterministic `AutomineSequencer` — one block per tx, no committee/prover/validator. Fast. | it exercises contract or protocol behavior that doesn't depend on real block-building or consensus (transfers, nested calls, note discovery, tx semantics). | yes |
| [`single-node/`](src/single-node/README.md) | One node, production sequencer (interval block production), optional prover. | it asserts on sequencer, proving, partial-proof, L1-reorg, recovery, fee, or cross-chain behavior on a single sequencer. | yes |
| [`multi-node/`](src/multi-node/README.md) | N validators on an in-memory mock-gossip bus. | it needs a committee: consensus, attestations, slashing, governance, or multi-validator block production. | yes |
| `p2p/` | Real libp2p transport between nodes. | the networking transport itself is under test (gossip, rediscovery, req/resp). | — |
| [`infra/`](src/infra/README.md) | Targets a deployed/external network (local anvil or a public testnet). | its concern is deployment or network targeting, not a specific protocol behavior. | yes |

A handful of tests live **outside** this package, next to the code they test — see
[Tests that live elsewhere](#tests-that-live-elsewhere). Other non-category test groups (`composed/`,
`guides/`, `bench/`) are described in the reference section.

## Where does my test go?

1. **Does it need real networking transport?** → `p2p/`.
2. **Does it need a validator committee (consensus/slashing/governance)?** → `multi-node/`.
3. **Does it assert on the production sequencer, proving, reorgs, fees, or cross-chain flows?** →
   `single-node/`.
4. **Is it pure contract/protocol behavior that's happy with one-block-per-tx?** → `automine/` (the
   default home for most contract tests).
5. **Is it really a unit/integration test of one package with no Aztec node?** → it probably belongs in
   that package, not here (see [Tests that live elsewhere](#tests-that-live-elsewhere)).

When in doubt, prefer `automine/` for contract behavior and `single-node/` for anything that watches the
chain advance.

---

## Reference for agents

This section is the detailed contract for adding, moving, and wiring tests. It assumes you've read the
overview above.

### Category base classes

Each category centralizes its environment in a base class. The hierarchy:

- `single-node/single_node_test_context.ts` → **`SingleNodeTestContext`**. Owns the environment
  (in-process anvil + L1 deploy), node spawning (`createNonValidatorNode`, `createProverNode`), the
  `ChainMonitor`, and the epoch/checkpoint/proof-window/reorg waiters.
- `multi-node/multi_node_test_context.ts` → **`MultiNodeTestContext extends SingleNodeTestContext`**.
  Adds the N-validator topology over a mock-gossip bus, inheriting the base environment and waiters.
- `automine/automine_test_context.ts` → **`AutomineTestContext`**. A sibling of `SingleNodeTestContext`
  (both wrap `fixtures/setup.ts:setup()`), but fixes the automine topology and makes `AUTOMINE_E2E_OPTS`
  the default. Exposes `markProvenAndWarp`, `registerContract`, `applyManualParentChild`.
- `p2p/p2p_network.ts` → **`P2PNetworkTest`**. Real libp2p; node creation goes through
  `setup_p2p_test.ts`.
- `infra/` has no shared base — its tests target a network selected by `L1_CHAIN_ID` (local anvil in CI,
  a public testnet with credentials).

All of the above ultimately wrap `fixtures/setup.ts:setup(numberOfAccounts, opts)`, the single entry point
that deploys L1 contracts, starts the node(s), and provisions a PXE and accounts.

### Setup factories

Categories expose thin factories over their base's static `setup`, named by what the test wants, so a test
calls the factory instead of spreading option presets:

- `single-node/setup.ts`: `setupWithProver` (fake in-process prover — the single-node default) and
  `setupBlockProducer` (no prover; raises `aztecProofSubmissionEpochs` to `1024` so unproven blocks
  aren't pruned, and points the PXE at `syncChainTip: 'proposed'`).
- `automine` tests call `AutomineTestContext.setup({ numberOfAccounts })` directly.

### The harness pattern (domain setup on top of a category)

A test suite with bespoke domain setup does **not** fork `setup()`. It subclasses the category base and
overrides a `protected hydrateFromContext(context)` split out of `setup`, so it reuses the base's
rollup/epoch-cache/chain-monitor/waiter/teardown machinery while adding its own domain state. Examples:

- `single-node/prover/` → `FullProverTest` (real Barretenberg env) extends `SingleNodeTestContext`.
- `single-node/fees/` → `FeesTest`; `single-node/cross-chain/` → `CrossChainMessagingTest`.
- `automine/token/` → `TokenContractTest` and `BlacklistTokenContractTest` extend `AutomineTestContext`
  and run their `TokenSimulator`/snapshot setup after `super.setup()`.

When two suites share behavior: if their public APIs are nearly identical, use inheritance; if behavior
overlaps but APIs differ, compose. Don't duplicate a category's environment wiring.

### The `.parallel` suffix

CI splits each `it` in a `.parallel.test.ts` file into its own docker job, running it in isolation via
`jest --testNamePattern` (the names come from `extract_test_names` in `bootstrap.sh`, which matches
`it`/`test` at **any** nesting depth, not just top level). When an `it` runs alone its enclosing
`beforeAll`/`beforeEach` hooks still run, but sibling `it`s do not. Rules:

- The `.parallel` suffix is for files whose `it`s are **independent**: every `it` must pass when run
  entirely on its own. That holds only when all shared state is built in `beforeAll`/`beforeEach` and no
  `it` reads or asserts on state produced by a sibling `it`.
- A file with sequential or stateful `it`s (progressive mutation across `it`s, a describe-scope variable
  assigned in one `it` and read in another, a note/token created in an earlier `it` and used later) stays
  a plain `.test.ts` **even if it has many top-level `it`s** — it runs as one ordered job. Adding
  `.parallel` to such a file breaks CI, because each `it` then runs without its predecessors.
- A file with a single top-level `it` is a plain `.test.ts`.
- Each file has exactly one top-level `describe`, named to match its path
  (e.g. `describe('automine/token/transfer', …)`).

### CI test discovery — `bootstrap.sh`

`end-to-end/bootstrap.sh` enumerates tests in two arrays, and a test must appear in the relevant one or it
**won't run in CI**:

- `test_cmds` (~line 37) — the standard run.
- `compat_test_cmds` (~line 290) — the forward/legacy-compat run (a subset).

Each leaf folder needs its own single-level glob line (e.g. `src/automine/token/*.test.ts`) in each array;
globs are not recursive, so every sub-folder is listed explicitly. Folders that organize by behavior get
one line per leaf. Bespoke handling to be aware of:

- **`avm_simulator`** (`automine/simulation/avm_simulator.test.ts`) has a dedicated line in `test_cmds`
  that sets `DUMP_AVM_INPUTS_TO_DIR` (feeds the downstream `avm_check_circuit` job) and is therefore
  excluded from the generic `simulation/` glob there (`!(avm_simulator)`). In `compat_test_cmds` it runs
  as a regular test (no dump line), so it is **not** excluded there.
- **`kernelless_simulation`** is excluded from `compat_test_cmds` only.

After editing the arrays, confirm every `*.test.ts` resolves through exactly one line (no duplicate, no
omission). Per-test bash `TIMEOUT` overrides live in the `case` block in `test_cmds` and must stay in sync
with the test's `jest.setTimeout`.

### Flaky tests — `.test_patterns.yml`

Flaky/owner entries live in `.test_patterns.yml` at the **git root** (not in this package), keyed on the
test path. A bare entry flags the test as flaky whenever it fails; add `error_regex` to flag only on a
matching message; `skip: true` disables it. Blanket regex entries (e.g. `src/automine/.*\.test\.ts`) are
depth-agnostic and survive folder renames; path-specific entries must be updated when a file moves.

### Compose / HA / web3signer tests

`src/composed/` tests run against a **running local network** rather than an in-process stack, via
`scripts/run_test.sh` in different modes:

- `src/composed/*.test.ts` → `compose` mode (e.g. `e2e_persistence`, `uniswap_trade_on_l1_from_l2`,
  `e2e_cheat_codes` — the compose variant, distinct from the relocated unit-style one).
- `src/composed/web3signer/*.test.ts` → `web3signer` mode (remote-signer scenarios).
- `src/composed/ha/*.test.ts` → `ha` mode (high-availability multi-process scenarios).
- `src/guides/*.test.ts` → tutorial/guide flows; `src/bench/` → benchmarks (see `bench_cmds`).

Run one compose test locally with `yarn test:compose <name>` (anvil + the test runner are spawned for
you), or `docker-compose up` for separate containers.

### Tests that live elsewhere

Tests with **no Aztec node** that exercise one package belong in that package, not here:

- L1 cheat-code behavior (`EthCheatCodes`/`RollupCheatCodes` against raw anvil) → `@aztec/ethereum`
  (`ethereum/src/test/eth_cheat_codes.test.ts`).
- The `SequencerPublisher` integration test (anvil + L1 deploy, no node) → `@aztec/sequencer-client`
  (`sequencer-client/src/publisher/`).

These run in their own package's test lane (both packages already run anvil-backed integration tests).

### Support directories (not test categories)

- `fixtures/` — the shared `setup()`, option presets (`fixtures.ts`), `CrossChainTestHarness`,
  `l1_to_l2_messaging`, and common utils.
- `shared/` — shared test bodies and `timing_env.mjs`, a **custom jest `testEnvironment`** referenced from
  this package's `package.json`. `yarn prepare` / the package-json check will try to revert it to the
  default — don't let it.
- `simulators/` — in-TS reference models (`TokenSimulator`, `LendingSimulator`) used to assert contract
  behavior.
- `test-wallet/`, `bench/`, `spartan/`, `quality_of_service/`, `forward-compatibility/` — helpers,
  benchmarks, and network/ops tests outside the topology categories.

### Running tests against legacy contract artifacts

To verify that contracts deployed from a previous release still work against the current stack, set
`CONTRACT_ARTIFACTS_VERSION` to a published version of `@aztec/noir-contracts.js` /
`@aztec/noir-test-contracts.js`:

```bash
CONTRACT_ARTIFACTS_VERSION=4.1.3 yarn test:e2e src/automine/token/access_control.parallel.test.ts
```

Only the JSON artifact files (`.../artifacts/*.json`) are redirected. The TypeScript wrapper classes
(e.g. `TokenContract`) continue to load from the current workspace and use the current `@aztec/aztec.js` —
so this exercises whether a deployed contract's ABI / bytecode / notes still work through the *new* client,
not whether the legacy wrapper code still imports cleanly.

The first run downloads the pinned packages into `.legacy-contracts/<version>/node_modules/` (cached across
runs). A startup banner and a per-redirect line are printed to stderr so you can confirm the legacy
artifacts were actually loaded:

```
[legacy-contracts][jest] CONTRACT_ARTIFACTS_VERSION=4.1.3
[legacy-contracts][jest] redirecting @aztec/noir-contracts.js/artifacts/*.json -> .legacy-contracts/4.1.3/...
[legacy-contracts][jest] redirected token_contract-Token.json -> /abs/.../.legacy-contracts/4.1.3/.../token_contract-Token.json
```

When `CONTRACT_ARTIFACTS_VERSION` is unset the test run is byte-identical to the default behaviour. The
cache is populated automatically on first use.
