---
name: writing-e2e-tests
description: How to write end-to-end tests in yarn-project/end-to-end. Use when adding e2e coverage for a feature, creating a new e2e test or suite, or deciding where an e2e test should live. Covers the test categories (automine, single-node, multi-node, p2p, composed), setup reuse, readability conventions, speed techniques, and flakiness prevention.
---

# Writing E2E Tests

E2E tests live in `yarn-project/end-to-end/src`. They spin up a real stack — anvil, an Aztec node
(archiver, world state, sequencer, p2p), a PXE-backed `TestWallet`, and optionally prover and
validator nodes — so they are the most expensive tests in the repo. Every decision below follows
from that: reuse setup, pick the cheapest category that exercises the feature, and make the test
robust against timing jitter because CI machines are slow and noisy.

For debugging a failing e2e test, use the `debug-e2e` skill; for profiling where suite time goes,
`track-e2e-times`. For unit tests, use `unit-test-implementation` — and prefer a unit test whenever
the feature doesn't genuinely need the full stack.

## Step 0: do you need a new test at all?

Work down this ladder and stop at the first step that fits. Each step down costs CI minutes forever.

1. **A unit test in the owning package.** If the behavior is observable without a live chain, it's
   not an e2e test.
2. **A new expectation in an existing test.** If an existing test already drives the code path
   (e.g. it sends the tx type you care about), add an `expect` there instead of paying another
   setup. Grep for the contract method or subsystem you're touching.
3. **A new `it` in an existing suite.** Suites share one setup in `beforeAll`; a new `it` costs
   seconds, a new file costs minutes.
4. **A new file on an existing category context or domain harness** (e.g. `AutomineTestContext`,
   `setupWithProver`, `TokenContractTest`, `FeesTest`, `MultiNodeTestContext`).
5. **A brand-new standalone test.** Last resort — justified when the feature needs a setup shape
   no existing suite has.

## Where to place the test

The top level of `src/` groups tests **by node topology**; the second level names the primary
behavior under test. Each category directory has a `README.md` describing its base class, setup
factories, helper surface, and subfolders — **read the README of the category you pick before
writing**; it is the authoritative, up-to-date reference and this skill only summarizes it.

### Categories

Pick the **cheapest category whose machinery your feature actually needs**. Cost and flake risk
increase down the table.

| Category | Context / entrypoint | Use for |
|---|---|---|
| `automine/` | `AutomineTestContext.setup({ numberOfAccounts })` (`automine_test_context.ts`) | Contract or protocol behavior that doesn't depend on real block-building or consensus: tokens, accounts, authwits, notes/events/effects, deploys, simulation. Deterministic and fast: the `AutomineSequencer` builds one block per submitted tx, publishes synchronously, no committee/prover/validator. |
| `single-node/` | `setupWithProver(opts)` or `setupBlockProducer(opts)` (`single-node/setup.ts`, over `SingleNodeTestContext`) | One production sequencer, no committee: block building, sequencer config/governance signalling, fees, cross-chain messaging, world-state sync, the proving/epoch lifecycle, partial proofs, L1 reorgs, recovery. `setupWithProver` adds a fake in-process prover; `setupBlockProducer` has no prover (and points the PXE at the `proposed` tip). Real Barretenberg proofs live in `single-node/prover/` on `FullProverTest`. |
| `multi-node/` | `MultiNodeTestContext` (extends `SingleNodeTestContext`) + presets in `multi_node_test_context.ts` | N validators on an **in-memory `MockGossipSubNetwork` bus** (no real libp2p): committee block production, attestations, invalid-attestation handling, HA pairs, slashing/offense detection, governance upgrades. Presets: `buildMockGossipValidators(n)`, `MOCK_GOSSIP_MULTI_VALIDATOR_OPTS`, `SLASHER_ENABLED_MULTI_VALIDATOR_OPTS`, `setupHaPairs`. |
| `p2p/` | `P2PNetworkTest` (`p2p/p2p_network.ts`) + `runGossipScenario` (`p2p/shared.ts`) | **Real libp2p only**: peer discovery/rediscovery, gossip mesh formation, req/resp, preferred-peer topologies, peer auth. Slowest and most flake-prone; nodes bind fixed ports, so two p2p files can never run concurrently locally. |
| `composed/` | docker-compose against a running network (`scripts/run_test.sh compose`) | The packaged sandbox/network as users see it: persistence, cheat codes, tutorials, uniswap, HA, web3signer. Also `guides/` for docs examples. |
| `infra/`, `spartan/`, `bench/` | see their READMEs | Deployment/ops smoke tests, k8s network tests, and benchmarks (see the `adding-benchmarks` skill) — not homes for feature coverage. |

The decision that trips people up most: **multi-node vs p2p**. If the subject — proposals,
attestations, checkpointing, pruning/recovery, offense detection — is faithfully reproduced by the
mock-gossip bus, it belongs in `multi-node/`, which is far cheaper. Only reach for `p2p/` when the
behavior genuinely cannot be reproduced without real networking.

Also cheaper than jumping categories: `setup()` options can bend a category upward —
`startProverNode: true`, `skipInitialSequencer: true`, and `mockGossipSubNetwork: true` give you
extra nodes without real libp2p.

### File placement and CI registration

- Second-level folders name the behavior under test (`token/`, `proving/`, `slashing/`), not the
  shared setup. A new folder is created only when it earns its keep: a shared harness, a coherent
  domain of several files. Otherwise the file lives flat in the category.
- Each file has a **single top-level `describe` named to match its path**
  (`describe('automine/token/transfer', ...)`), and starts with a short header comment describing
  the coverage and the setup shape (see `automine/token/transfer.test.ts` for the pattern).
- A co-located `setup.ts` in the subfolder holds shared timing profiles/option wiring (e.g.
  `single-node/l1-reorgs/setup.ts`, `multi-node/slashing/setup.ts`); domain harnesses are
  co-located `*_test.ts` files (not `.test.ts`, so jest doesn't run them).
- CI picks up new files **automatically**: `end-to-end/bootstrap.sh` `test_cmds` globs each
  category. Each file runs as its own isolated job with a default `TIMEOUT=20m`; if your suite
  legitimately needs more, add a per-test override in the `case` block there — and keep it in sync
  with the file's `jest.setTimeout`.
- `*.parallel.test.ts` marks a file with more than one top-level `it`: CI extracts each `it` title
  and runs it as a **separate job** (`jest -t '<name>'`). Every `it` must pass in isolation — no
  cross-test state — and titles must be unique and stable (they become job/container names).
- `*.notest.ts` parks a test without running it (prefer fixing or deleting).
- Jest gives each test/hook 300s (`--testTimeout=300000` in `test:e2e`). Set an explicit
  `jest.setTimeout(...)` at the top of the `describe` when setup or waits legitimately exceed it —
  and only then (see Flakiness below).

## Setup reuse

**Search for an existing setup before building one.** The layers, outermost first:

1. **Category context classes** (table above) own the environment: anvil + L1 deploy, node
   spawning, the `ChainMonitor`, waiters, and teardown. Don't call the root `setup()`
   (`fixtures/setup.ts`) directly from a new test — go through the category's context/factory, and
   pass options through it.
2. **Domain harnesses** extend a context with domain state and opt-in setup phases:
   `automine/token/token_contract_test.ts` (`TokenContractTest`: `applyBaseSnapshots()`,
   `applyMint()`), `automine/token/blacklist_token_contract_test.ts`,
   `single-node/fees/fees_test.ts` (`FeesTest`: `applyBaseSetup()`, `applyFPCSetup()`,
   `applyFundAliceWithBananas()`, ...), `single-node/cross-chain/cross_chain_messaging_test.ts`,
   `single-node/prover/` (`FullProverTest`), `multi-node/slashing/inactivity_setup.ts`.
3. **Root `setup()` options** (`SetupOptions` in `fixtures/setup.ts`) cover most needs without new
   code: genesis-funded accounts (`initialFundedAccounts`, `numberOfInitialFundedAccounts`),
   `fundSponsoredFPC`, `startProverNode`, `skipInitialSequencer`, validators
   (`initialValidators`), custom genesis (`genesisPublicData`), timing (`aztecSlotDuration`,
   `ethereumSlotDuration`, `aztecEpochDuration`), `mockGossipSubNetwork`, and any
   `AztecNodeConfig` field. Read the type before adding a new option.

The standard shape of a suite test file:

```typescript
describe('automine/token/transfer', () => {
  const t = new TokenContractTest('transfer');
  let { asset, adminAddress, wallet, otherAddress, tokenSim } = t;

  beforeAll(async () => {
    t.applyBaseSnapshots();
    await t.setup();
    await t.applyMint();
    ({ asset, adminAddress, wallet, otherAddress, tokenSim } = t);
  });

  afterAll(() => t.teardown());
  afterEach(async () => {
    await t.tokenSim.check(); // model-based invariant check after every test
  });

  it('transfers between accounts', async () => { /* ... */ });
});
```

Rules of thumb:

- **One environment per file, set up in `beforeAll`** — never per test. If tests can't share
  state, make them not need to (fresh contract instance per test is fine; fresh network per test
  is not), or split the file.
- Only apply the setup phases you need — every `apply*` costs txs (and therefore blocks).
- New shared state for several tests → an `apply*` method on the harness (or a new harness
  extending the context), so other files can reuse it.
- `afterAll(() => teardown())`, and if a local `teardown` variable is set inside `beforeAll`,
  guard it: `afterAll(() => teardown?.())` — if setup throws, an unguarded call masks the real
  error with `TypeError: teardown is not a function`.
- When combining a preset with overrides, **spread the preset first** so your overrides win:
  `{ ...MOCK_GOSSIP_MULTI_VALIDATOR_OPTS, aztecEpochDuration: 4 }`. Spreading the preset last
  silently reverts your options.

## Readability

The test body should read as **intent**: what is executed, what is asserted. Push mechanics into
helpers, preferably shared ones.

- **Prefer the named waiters over hand-rolled polling.** Node/wallet-level waits live in
  `fixtures/wait_helpers.ts` (`waitForBlockNumber`, `waitForProvenBlock`, `waitForNodeCheckpoint`,
  `waitForTxs`, `waitForTxStatus`, `waitForPendingTxCount`, `waitForSequencerState`, ...); context
  waiters live on `SingleNodeTestContext`/`MultiNodeTestContext` (`waitUntilEpochStarts`,
  `waitUntilProvenCheckpointNumber`, `waitForNodeToSync`, `waitForSequencerEvent`,
  `waitForAllNodes*`, `findSlotsWithProposers`); L1-side waits on `ChainMonitor`
  (`waitUntilCheckpoint`, `waitUntilL2Slot`, `waitUntilL1Timestamp`). A raw
  `retryUntil`/`.on`/`sleep` in a test body is a smell — wrap it or find the existing helper.
- **Reuse the shared helpers** before writing inline plumbing: `fixtures/token_utils.ts`
  (`deployToken`, `mintTokensToPrivate`, `mintNotes`, `expectTokenBalance`),
  `shared/submit-transactions.ts`, `shared/cross_chain_test_harness.ts`,
  `fixtures/l1_to_l2_messaging.ts`, `expectMapping` from `fixtures/setup.ts`. Suite-local
  assertion helpers go in a co-located file (e.g. `automine/token/token_test_helpers.ts`) — never
  duplicated across test bodies.
- **Simulators for stateful suites**: `TokenSimulator` (`src/simulators/`) mirrors expected
  balances in memory; an `afterEach` calls `tokenSim.check()` so every test gets full-state
  verification without per-test assertion boilerplate. Follow this pattern for new stateful
  suites.
- **Expected errors are shared constants**, not inline strings: `U128_UNDERFLOW_ERROR`,
  `DUPLICATE_NULLIFIER_ERROR`, `NO_L1_TO_L2_MSG_ERROR`, etc. in `fixtures/fixtures.ts`. Add new
  protocol-level error patterns there.
- Destructure the harness once in `beforeAll` so test bodies use plain names (see the example
  above).
- Log with the context logger (`t.logger.info('...')`) at phase boundaries of long tests — it is
  what makes CI logs debuggable — but don't narrate every line.
- A comment in a test explains a non-obvious *why* (e.g. "proxy makes msg_sender differ from the
  note owner to trigger authwit validation"), never *what* the next line does.

## Speed

We favor robustness over speed, but e2e minutes are the bottleneck of every CI run. Techniques
that have actually paid off in the ongoing e2e speedup effort:

1. **Don't create setup you don't need.** The single biggest cost is network + account setup.
   Joining an existing suite costs ~0; every avoided account deploy saves a proof + a block. Use
   genesis-funded accounts over deploys, the hardcoded schnorr account
   (`fixtures/schnorr_hardcoded_account_contract.ts`) when the test doesn't care about identity,
   `AutomineTestContext.registerContract(...)` / `TestContract` for contracts usable without an
   on-chain deploy, and only the `apply*` phases you need.
2. **Seed state at genesis instead of executing setup txs.** `setup()` options like
   `initialFundedAccounts`, `fundSponsoredFPC: true`, and `genesisPublicData` bake state into the
   genesis trees for free. Prefer these over bridging/minting/deploying in `beforeAll`. (The
   current speedup round extends this: standard-contract registration and FPC funding seeded via
   prefilled genesis nullifiers/public data — check `SetupOptions` for `prefilled*`/preload
   options and reuse them when available.)
3. **Batch same-sender setup txs into one `BatchCall`** — one proof and one block instead of N.
   See `mintNotes` in `fixtures/token_utils.ts`. Note limits apply (e.g. only one contract-class
   log per tx, so two contract deploys can't batch).
4. **Overlap independent setup txs with `Promise.all`** — but know the ceiling: the PXE
   serializes simulation/proving on one queue, so concurrent sends often land in consecutive
   blocks anyway. Batching (one tx) beats overlapping (N txs) when the sender is the same.
5. **Warp over dead waits.** When the test waits for a timestamp/epoch boundary and *nothing
   needs to be produced* during the wait, jump: `cheatCodes.warpL2TimeAtLeastTo/By` (L1+L2
   together), `cheatCodes.eth.warp(ts, { resetBlockInterval: true })` (L1 only, for big jumps),
   `markProvenAndWarp` on `AutomineTestContext` (marks checkpoints proven first so a long warp
   doesn't trip the pruning window), `warpWithSequencersPaused` on `SingleNodeTestContext` (pauses
   sequencers across the warp so in-flight jobs don't cascade). **An honest wait beats a flaky
   warp**: if sequencers/provers must actually do something during the window (attest, prove,
   slash), warping skips the behavior under test — don't convert those.
6. **Don't tighten slot durations ad hoc.** Slot/epoch durations interact with the sequencer
   timetable; too-tight cadences are the top historical flake source (see Flakiness). Use the
   named timing profiles (category presets, the co-located `setup.ts` profiles) instead of
   inventing per-test numbers, and leave slack — CI event loops stall for hundreds of ms
   routinely.
7. **Measure before optimizing.** Setup and wait helpers are span-instrumented via `testSpan`
   (`fixtures/timing.ts`, enabled by `TEST_TIMING_FILE`); use the `track-e2e-times` skill to get a
   ranked breakdown of where the time goes. Wrap new expensive shared helpers in `testSpan` so
   they show up. Cite before/after span numbers when proposing a speed change.

## Flakiness

A test that fails 1-in-50 runs costs more than it's worth. These are the recurring root causes
from six months of deflake PRs — write the test right the first time.

### The golden rules

1. **Never `sleep()` to wait for a state change.** Poll the condition with the named waiters
   (Readability above), or `retryUntil(fn, name, timeoutSec, intervalSec)` from
   `@aztec/foundation/retry` when no named helper fits. A raw sleep is only acceptable to yield
   the event loop, never to "give X time to finish".
2. **Assert against the tx receipt, not the chain tip.** Use `receipt.blockNumber`; never
   `getBlock('latest')` right after sending — an empty block/checkpoint may have landed in
   between. For `contract.methods.foo().send()`, destructure `{ receipt }`.
3. **Mined ≠ checkpointed ≠ proven.** A tx wait proves a node saw the tx mined — not that the
   archiver indexed it, that it survived a reorg, or that it was proven.
   - Asserting on archiver/world-state after a tx: wait on the subsystem's own durable marker,
     e.g. `waitForNodeCheckpoint(node, target)` or `waitForBlockNumber(node, n, { tag:
     'checkpointed' })`.
   - If the test can experience pruning/reorgs (proving, recovery, multi-node — anything stopping
     nodes), anchor the PXE to the durable tip: `syncChainTip: 'checkpointed'` in pxe opts, and
     use `send({ wait: { waitForStatus: TxStatus.CHECKPOINTED } })` for setup txs that later
     assertions depend on. (`setupBlockProducer` deliberately uses `'proposed'` so tests can
     assert on fresh blocks — know which one your suite needs.) Classic flake signature:
     `Block <hash> not found in the node. This might indicate a reorg has occurred`, or a receipt
     wait hanging forever.
   - **Proven/finalized never advances by itself in most setups**: the `AnvilTestWatcher`'s
     auto-prove is dormant once anvil is in interval mining. If the test needs the proven tip to
     move, use `markProvenAndWarp` / `cheatCodes.rollup.markAsProven()` or run a prover
     (`setupWithProver`, `startProverNode: true`). Otherwise a `while (proven < n)` loop hangs to
     wall clock.
4. **Leave timing margin.** Under proposer pipelining the sequencer builds slot N during slot
   N-1, so effects land a slot later than naive math suggests, and config injected via
   `node.setConfig()` is snapshotted when a job is *constructed* — one slot early. Anchor slot
   arithmetic to a fresh boundary (`monitor.waitUntilNextL2Slot()`) before reading `currentSlot`;
   target slots with `+3/+4` margin rather than `+2`; when targeting a specific proposer, use
   `findSlotsWithProposers` rather than hard-coded slot pairs (the prior pipelined slot must not
   share the proposer); after a mid-test `setConfig` of block-gating options, wait for the
   sequencer to pick it up before sending dependent txs. Historical top-flake: timetable too
   tight — the presets' slot durations exist because validators must simulate, attest, and
   publish within them on a loaded CI machine; don't undercut them in a new test.
5. **Don't force `minTxsPerBlock >= 1` under a wall-clock sequencer** unless tx-gated block
   production is the behavior under test. It stalls scheduled empty checkpoints and drops txs.
6. **Assert the invariant, not an incidental exact value.** Exact block numbers, exact slots,
   exact committee members, and `toBeGreaterThan` off-by-ones are the most common deflake diffs.
   If the exact value matters, *derive* it from the receipt/committed header/actual committee;
   if the system decides it (which slot a fault lands on, when a prune executes), **discover it
   by polling, then assert on the discovered value** — don't hardcode the assumption. For
   ramp-up/settle phases, assert a tolerance budget, not zero. When filtering sequencer events,
   exclude known-benign failures explicitly (see the existing filters in `watchSequencerEvents`
   call sites) rather than asserting no events at all.
7. **Serialize against shared resources.**
   - L1 accounts: never reuse mnemonic index 0 (the sequencer's publisher) for a test actor;
     take a dedicated unused index via `getPrivateKeyFromIndex(i)` (see
     `L1_DIRECT_WRITE_ACCOUNT_INDEX` in `fixtures/fixtures.ts`). Nonce races present as
     `nonce too low` / stuck publishers.
   - Await the receipt of a prerequisite L1 tx before sending a dependent one.
   - Parallel local runs need distinct `ANVIL_PORT`s (the fixture honors the env var); p2p tests
     bind fixed UDP/TCP ports, so never run two p2p files at the same time.
   - Data directories: use the context's management (`P2PNetworkTest.dataDirFor(label)`), don't
     `mkdtemp`/`rmSync` in test files.
8. **Attach listeners before causing the event**, and freeze time across restarts. Listeners
   registered after initial sync miss events that fire during sync — if the test stops/recreates
   nodes while an L1 deadline approaches, pause anvil mining across the gap and resume
   deterministically (set next timestamp + mine) so the transition happens while someone is
   listening. Add a fail-fast assertion that the deadline hasn't passed yet.
9. **P2P: connectivity ≠ gossip readiness.** Wait for the gossip mesh
   (`waitForP2PMeshConnectivity`; raise `minMeshPeerCount` when a proposal must reach the whole
   committee within a slot) before sending txs, or they publish to zero peers and silently
   expire. Prefer the `runGossipScenario` skeleton over hand-rolling the bootstrap→nodes→mesh
   sequence. Don't over-specify topology (requiring a full clique flakes on one missing edge);
   assert the property the test needs. Gossip is not a durable record — late attestations get
   rejected by acceptance windows before downstream consumers see them.
10. **Fees evolve between snapshot and inclusion.** Use `getPaddedMaxFeesPerGas` /
    `walletMinFeePadding` rather than exact predicted fees, and derive expected committed fees
    from the block header, not from a later `getCurrentBaseFees()` call.
11. **Keep the test deterministic.** Mock `Math.random` when the code under test makes random
    choices; never mix fake clocks with real sleeps — drive all timing through the fake clock.
12. **Timeouts express expected duration, not hope.** Raise `jest.setTimeout` only when the flow
    legitimately takes that long (proving, multiple epochs) and say why; a bumped timeout that
    hides a hang just moves the failure to the 20m CI kill. Keep the bootstrap.sh `TIMEOUT` and
    `jest.setTimeout` in sync.

### Before you ship it

- Run the test repeatedly: `scripts/deflaker.sh yarn workspace @aztec/end-to-end test:e2e <file>`
  (100 runs, stops at first failure). At minimum run it 3-5 times locally, including once under
  load.
- Run with verbose logs once and read them: `LOG_LEVEL='info; debug:sequencer,archiver,publisher'
  yarn workspace @aztec/end-to-end test:e2e src/<category>/<file>.test.ts -t 'test name'`.
- If a known-unfixable external flake remains, the last resort is an entry in `.test_patterns.yml`
  (repo root) with a **tightly-scoped `error_regex`** and an owner — it alerts instead of failing
  CI. This is for tracked product fragility, not a substitute for fixing the test.

## Checklist

- [ ] Couldn't be a unit test, an added expectation, or a new `it` in an existing suite
- [ ] Cheapest category that exercises the feature (automine → single-node → multi-node → p2p);
      category README read
- [ ] One environment per file in `beforeAll`, via the category context/factory; preset spread
      first; guarded teardown
- [ ] Single top-level `describe` named to match the path; header comment; `.parallel` suffix iff
      multiple independent top-level `it`s
- [ ] Test body reads as intent; named waiters and shared helpers; shared error constants
- [ ] No sleeps; receipt-anchored assertions; correct tip tag (`proposed` vs `checkpointed`)
- [ ] No exact-value assertions on system-decided values; timing margin per rule 4
- [ ] `jest.setTimeout` justified and in sync with bootstrap.sh `TIMEOUT` if overridden
- [ ] Deflaker/local repeat runs pass; verbose-log run reviewed
