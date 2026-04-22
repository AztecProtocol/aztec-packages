# Task: Move e2e nodes into worker threads (Tier A)

Working doc for the `ag/wt-e2e` branch. Lives here (not in plans/) because it spans
foundation + stdlib + aztec-node + slasher + end-to-end, and the branch strategy
needs a single source of truth.

---

## TL;DR

Goal: run the `AztecNodeService` spawned by the e2e `setup()` fixture inside a
Node.js worker thread, so its event loop is isolated from the test thread. The user's
reason for wanting this: **reduce flakiness from event-loop starvation** — test CPU
work (simulation, serialization, retry loops) delaying the sequencer's slot timer
past a slot boundary is a real source of intermittent failures today.

Scope: **Tier A only**. One worker wrapping the initial node (and the optional prover
node when `opts.startProverNode`). Multi-validator p2p workers and the mock gossipsub
bus bridge are **deferred**.

---

## Branch state

Base: `next`.
Current HEAD: `5f3f7ff462`.

### Commits on branch

| # | SHA | Subject | What |
|---|---|---|---|
| 1 | `05ffdac659` | `refactor(end-to-end): drive e2e setup from typed env vars` | setup() now takes typed `AztecNodeEnvVars = Partial<Record<EnvVar, string>>`. ~90 call sites rewritten. Prereq for workers: worker-safe config input. |
| 2 | `5f3f7ff462` | `feat(stdlib): expose L1 tx delayer on AztecNodeDebug` | 5 new methods on `AztecNodeDebug` keyed by `L1TxDelayerRole = 'sequencer' \| 'prover'`. Pure addition; no call sites migrated. |

Pre-existing unstaged change: `barretenberg/sol/test/utils/Debug.sol` — unrelated, leave alone.

---

## Why the setup() refactor came first

Before this branch, the e2e `setup()` accepted `Partial<AztecNodeConfig>` — rich
classes (`SecretValue`, `EthAddress`, `Fr`) crossing the API boundary. Those don't
survive `structuredClone` / `workerData`, so worker threads were impossible without
first normalizing the input.

Now the API is `setup(numberOfAccounts, env, opts, pxeOpts, chain)` where `env` is a
plain string-keyed/string-valued map. It serializes trivially. Every knob is
round-tripped through the real config parser, which is a hygiene win on its own — see
[MEMORY note on why we did full cut-over instead of a compat layer].

Key pieces of the setup() refactor (done, not repeating):
- `getConfigFromMappings(mappings, env = process.env)` in `foundation/src/config/index.ts` now accepts an optional env source.
- `aztecNodeConfigToEnvVars(config: Partial<AztecNodeConfig>)` helper in
  `end-to-end/src/fixtures/setup.ts` — serializes typed configs back to env-var bags
  for wrappers (P2PNetworkTest) that still assemble typed configs internally.
- `TEST_DEFAULT_ENV` seeds e2e-only defaults (`PROVER_REAL_PROOFS=false`,
  `P2P_LISTEN_ADDR=127.0.0.1`, etc.).
- `SLASH_SELF_ALLOWED` was unbound; we added an env binding while here.

---

## Flake data — Tier A justification (CI snapshot 2026-04-22)

Pulled from `ci.aztec-labs.com/section/next`: **1028 flake events** (791 FLAKED + 237 FAILED) over ~4 weeks (2026-03-25 → 2026-04-21).

### Top e2e flakes

| Test | Count | Setup shape | Failure signature |
|---|---:|---|---|
| `epochs_mbps.parallel` (anchored-to-checkpointed) | 63 | single-node | slot missed |
| `e2e_p2p/gossip_network.test.ts` | 42 | multi-validator (4) | attestation timeout |
| `e2e_epochs/epochs_invalidate_block.parallel.test.ts` | 36 | multi-validator (6) | attestation timeout |
| `e2e_p2p/duplicate_proposal_slash.test.ts` | 31 | multi-validator | attestation timeout |
| `e2e_p2p/preferred_gossip_network.test.ts` | 29 | multi-validator | attestation timeout |
| `e2e_epochs/epochs_proof_fails.parallel.test.ts` | 29 | single-node | slot missed |
| `e2e_bot.test.ts` | 27 | single-node | sequencer interrupted |
| `epochs_mbps.parallel` (proposed-blocks) | 26 | single-node | slot missed |
| `e2e_epochs/epochs_l1_reorgs.parallel.test.ts` | 26 | single-node | slot missed + L1 |
| `composed/ha/e2e_ha_full.test.ts` | 23 | multi-validator HA | attestation timeout |
| `e2e_offchain_payment.test.ts` | 20 | single-node | slot missed |
| `e2e_p2p/duplicate_attestation_slash.test.ts` | 20 | multi-validator | attestation timeout |

Noise filters: `p2p/src/client/test/p2p_client.integration_message_propagation.test.ts` tops the raw list at 153 but it's a unit test inside the p2p package, not an e2e Aztec-node test — outside both Tier A and Tier C scope. `kv-store yarn test` timeouts (20) are infra, also unrelated. Don't count either of these when judging tier progress.

### Split: single-node (~191) vs multi-validator (~225)

- **Tier A scope** (single-node `setup()` flakes — mbps x3 variants + epochs_proof_fails + epochs_l1_reorgs.parallel + e2e_bot + e2e_offchain_payment + others): ~191 events, ~46% of e2e flakes.
- **Tier C scope** (multi-validator p2p — gossip_network, preferred_gossip_network, duplicate_*_slash, epochs_invalidate_block, ha_full, rediscovery, add_rollup, reqresp*, epochs_ha_sync): ~225 events, ~54%.

### Smoking-gun messages

Single-node — supports event-loop-starvation hypothesis; Tier A addresses:
```
sequencer:checkpoint-proposal node-0 slot-9  Not enough txs to build block 9 at index 0 in slot 9 (got 0 txs but needs 1)
sequencer:checkpoint-proposal node-0 slot-9  No blocks were built for slot 9
```
```
sequencer node-0 Error in running promise: SequencerInterruptedError: Sequencer was interrupted
```

Multi-validator — different failure class; Tier A will not fix:
```
Background attestation/L1 pipeline failed: AttestationTimeoutError: Timeout collecting attestations for slot 26: 3/4
prover-node:epoch-proving-job  Error running epoch 3 prover job: Failed to submit epoch proof to L1
```

Keyword-hit counts (attestation timeout / "No blocks built" / "Not enough txs") from sampled logs: `gossip_network` 328, `e2e_bot` 46, `e2e_offchain_payment` 50, `epochs_invalidate_block` 19, `epochs_mbps` 2.

### Verdict

Tier A is justified but partial: it targets ~half the e2e flake surface. Don't measure Tier A success against the full flake list — the multi-validator half needs Tier C or the `MockGossipSubNetwork` → real libp2p-loopback swap (the cheaper alternative noted in the "explicitly NOT doing" section). Expect a ~150–200 events/month drain on the dashboard from Tier A alone.

Session-local dumps used for this snapshot (will not persist across reboots): `/tmp/failed_tests_next.log`, `/tmp/{5853337324772d4e,df34a390d63c2a41,d18593cbcfb9dfe0,c62dd5f2c17df82e,224ec13185cf3fe9}.log`.

---

## Tier A architecture (the plan)

```
  Main thread (test)                     Worker thread
  ┌──────────────────────────┐           ┌───────────────────────────┐
  │ test + fixtures          │           │ node_worker_script.ts     │
  │  TestDateProvider  ──────┼──port────▶│  RemoteDateProvider       │
  │  Wallet / PXE (in-proc)  │           │  AztecNodeService         │
  │  Anvil child process     │           │   (sequencer, archiver,   │
  │                          │           │    world-state, p2p off)  │
  │  NodeHandle  ────────────┼──JSON-RPC─┤  TransportServer          │
  │   .client: AztecNode &   │  via      │                           │
  │           AztecNodeAdmin │  postMsg  │                           │
  │         & AztecNodeDebug │           │                           │
  └──────────────────────────┘           └───────────────────────────┘
```

### `NodeWorker` harness (to write)

New dir `end-to-end/src/fixtures/node-worker/`:
- `node_worker.ts` — main-thread class, spawns worker, opens
  `NodeConnector`-backed `TransportClient`, exposes a
  `client: AztecNode & AztecNodeAdmin & AztecNodeDebug`.
- `node_worker_script.ts` — worker entrypoint. Reads `workerData = { env, genesis,
  dataDirectory, dateProviderPort, dontStartSequencer, dontStartProverNode }`.
  Calls `AztecNodeService.createAndSync(getConfigFromMappings(aztecNodeConfigMappings,
  env), deps, options)`. Deps:
  - `dateProvider`: `RemoteDateProvider` (below)
  - `telemetry`: fresh `TelemetryClient` built from the env inside the worker —
    per-worker. This breaks `bench/utils.ts::telemetry.getMeters()`; we'll carry an
    `inlineNode: true` opt-out for benches (detail below).
  - `p2pClientDeps`: not passed (Tier A doesn't touch p2p).
- `node_rpc_surface.ts` — declares the typed interface the worker exposes.

Template to copy verbatim:
- `end-to-end/src/test-wallet/worker_wallet.ts:36-116` (spawn, transport wiring, `workerDied` error race)
- `end-to-end/src/test-wallet/wallet_worker_script.ts:1-61` (entrypoint, `workerData` destructure, `TransportServer` + handler)

### `RemoteDateProvider` + MessagePort bridge

- Authoritative `TestDateProvider` stays in main thread. Tests keep calling
  `setTime` / `setOffset` on it.
- A `MessageChannel` port travels via `workerData.dateProviderPort`
  (MessagePort is transferable to a worker).
- Every `setTime` / `setOffset` posts `{ offset }` down the port. Worker's
  `RemoteDateProvider` updates its local offset synchronously on `message`.
- Add ack-on-`setTime` only if tests show drift. Default: fire-and-forget.

### `NodeHandle` (EndToEndContext surgery)

```
-  aztecNodeService: AztecNodeService
-  sequencer: SequencerClient | undefined
-  sequencerDelayer: Delayer | undefined
-  proverNode: AztecNodeService | undefined
-  proverDelayer: Delayer | undefined
+  node: NodeHandle
+  proverNode: NodeHandle | undefined
```

`NodeHandle` is the main-thread-visible wrapper; its `client` is the RPC proxy,
`stop()` owns teardown.

### Delayer access (already shipped)

The `context.sequencerDelayer.pauseNextTxUntilTimestamp(ts)` → `context.aztecNodeDebug.pauseNextL1TxUntilTimestamp('sequencer', ts)` migration is **unblocked now**: the server-side methods are in HEAD (`5f3f7ff462`). That migration could even land *before* the worker move — it would stand on its own.

---

## RPC surface: what exists now vs. what we still need

### Exists in HEAD (we just shipped)

Five methods on `AztecNodeDebug`:
- `pauseNextL1TxUntilTimestamp(role, ts)`
- `pauseNextL1TxUntilBlock(role, blockNumber)`
- `cancelNextL1Tx(role)`
- `getSentL1TxHashes(role) -> \`0x\${string}\`[]`
- `getCancelledL1Txs(role) -> \`0x\${string}\`[]`

Where `role: 'sequencer' | 'prover'`. Server throws `BadRequestError` when the
role's delayer is missing. Round-trip tested in
`stdlib/src/interfaces/aztec-node-debug.test.ts`.

### Still needed for Tier A

Probably **none**. The audit showed:
- `sequencer?.updateConfig(...)` → already covered by `AztecNodeAdmin.setConfig`.
  Need to confirm every field tests set is in `AztecNodeAdminConfigSchema`; patch if
  not.
- `sequencer?.getDelayer()` → covered by the new debug RPCs.
- `aztecNode.getBlockSource()` cast to `Archiver` → **NOT NEEDED for Tier A**. Those
  2 tests (`e2e_p2p/gossip_network_no_cheat.test.ts`,
  `preferred_gossip_network.test.ts`) use the multi-validator nodes from
  `setup_p2p_test.ts`, which stay in-process. Revisit when p2p nodes move to workers
  (Tier C).

### Deferred (Tier C work)

`getCheckpointedBlock(blockNumber)` on `AztecNodeDebug`. Five-line addition when
the time comes.

---

## Next session — concrete next steps

In order of dependency:

### 1. `NodeWorker` scaffolding (~1–2 hours)

Build the worker harness end-to-end without touching `setup()`. Smoke-test it with
a small standalone script (or unit test) that spawns the worker with a fake config
and hits the RPC.

Key risks at this step:
- **Bundle size / boot time.** The aztec-node package pulls archiver, world-state,
  sequencer, bb-prover, protocol circuits — a lot. `TestWallet`'s worker only loads
  PXE, which is smaller. Expect the first worker boot to take 2–5s. If it's
  catastrophic (>10s), consider a warm-pool later; don't pre-optimize.
- **Data directory.** Worker needs its own `DATA_DIRECTORY` env set (tempdir), same
  as today's setup(). The main thread computes the path and passes it in env.
- **Shared blob storage.** `BLOB_FILE_STORE_URLS` / `BLOB_FILE_STORE_UPLOAD_URL`
  point at a filesystem path. Main thread computes it once, injects into every
  worker's env.

### 2. `RemoteDateProvider` bridge (~30 min)

Implement the port-based time sync. Unit-test it with `node:worker_threads` — spawn
a tiny worker, warp time on main, assert the worker sees it.

### 3. Rewrite `setup()` initial-node + prover-node block (~2–3 hours)

Replace the two `AztecNodeService.createAndSync` call sites in
`fixtures/setup.ts` with `new NodeWorker(...)`. Tricky bits:
- The dynamic `minTxsPerBlock` adjustment (currently sets to 0/1 to progress past
  genesis, then restores) becomes a `setConfig` RPC call.
- The post-deploy mutations (`config.l1Contracts = ...`,
  `config.sequencerPublisherPrivateKeys = ...`, etc.) need to happen **before** the
  worker spawn since they drive the config. Main thread computes them, injects as
  env or serialized fields.
- `context.aztecNodeService.getSequencer()` callers in setup() itself (~3 places)
  need to become RPC calls.
- Add `inlineNode: true` opt-out on `SetupOptions` for benches.

### 4. Call-site migration (~2 hours)

Mechanical. Grep targets:
```
grep -rn "sequencerDelayer\|proverDelayer" end-to-end/src
grep -rn "context\.sequencer?\.getDelayer\|context\.sequencer?\.updateConfig" end-to-end/src
grep -rn "\.getBlockSource()" end-to-end/src
```

Roughly ~35 files. Most are already dual-path (test uses `context.aztecNodeAdmin.setConfig` AND
`context.sequencer?.updateConfig`); remove the concrete-class path and keep the RPC.

### 5. Verification (~30 min + test runtime)

Representative suite:
- `yarn workspace @aztec/end-to-end test:e2e src/e2e_simple.test.ts`
- `yarn workspace @aztec/end-to-end test:e2e src/e2e_block_building.test.ts`
- `yarn workspace @aztec/end-to-end test:e2e src/e2e_sequencer_config.test.ts`
- `yarn workspace @aztec/end-to-end test:e2e src/composed/e2e_persistence.test.ts` (stresses worker shutdown/restart)
- `yarn workspace @aztec/end-to-end test:e2e src/e2e_epochs/epochs_proof_fails.parallel.test.ts` (exercises the delayer RPCs end-to-end)

Budget: `e2e_simple` ≤20% slower. Baseline from pre-worker run: **66s**. If >80s
after worker move, investigate before merging.

---

## Gotchas / decisions cached

- **`schemas.BigInt` not `z.bigint()`** in `ApiSchemaFor`. JSON-RPC serializes
  bigints as strings; `z.bigint()` fails on the wire. Cost me 2 failing tests
  first try.
- **`AztecNodeService` implements all three of `AztecNode`, `AztecNodeAdmin`,
  `AztecNodeDebug`** (see `server.ts:138`). Adding methods to any of those
  interfaces requires a matching impl on the class. TS catches it but worth
  remembering.
- **`MockAztecNodeDebug` in `aztec-node-debug.test.ts`** needs stub impls for
  every new method; omitting them fails with TS2739.
- **`bench/utils.ts::telemetry.getMeters()`** is the only bench-introspection
  site. Per-worker telemetry clients break it. Plan: `inlineNode: true`
  opt-out on `SetupOptions` for benches; defer the shared-hub design.
- **Archiver RPC additions deferred.** See above.
- **`enableDelayer` has no env var.** Still a hardcoded post-parse mutation in
  setup.ts (`config.enableDelayer = true`). Fine as-is.
- **`EndToEndContext.aztecNodeService`**: removing this field (not `Proxy`-wrapping
  it) is the design choice. Forces tests onto the clean RPC surface.
- **Full cut-over pattern**: per the user's preference (see MEMORY). Don't build a
  compat layer — migrate all call sites in the same PR. ~35 of them here is
  manageable.

---

## Explicitly NOT doing (for this branch)

- **Tier B** — p2p-harness prover node (`createProverNode` in
  `setup_p2p_test.ts`) into a worker. The `setup()` prover node (via
  `opts.startProverNode`) **is** in scope and does get worker-moved in Tier A.
- **Tier C** — multi-validator nodes into workers. Requires splitting
  `MockGossipSubNetwork` into a MessagePort-based bus while preserving latency
  simulation and peer scoring. High risk, bespoke. If p2p flakiness is still the
  problem after A/B ship, the cheaper alternative is swapping
  `MockGossipSubNetwork` for real libp2p on loopback.
- **Telemetry hub.** Per-worker clients for Tier A; hub is a follow-up.
- **Ad-hoc `AztecNodeService.createAndSync` call sites** in specific tests
  (`e2e_synching`, `e2e_ha_full`, `e2e_epochs/epochs_test.ts:347`,
  `fixtures/e2e_prover_test.ts:258`). Keep in-process for Tier A.
- **PXE / wallet** in workers. Separate existing path (`TestWallet` worker).

---

## Reference files (fast-nav)

- Setup refactor: `yarn-project/end-to-end/src/fixtures/setup.ts`
- Env var union: `yarn-project/foundation/src/config/env_var.ts`
- Parser: `yarn-project/foundation/src/config/index.ts`
- Delayer (worker-side): `yarn-project/ethereum/src/l1_tx_utils/tx_delayer.ts`
- AztecNodeDebug: `yarn-project/stdlib/src/interfaces/aztec-node-debug.ts`
- AztecNodeAdmin: `yarn-project/stdlib/src/interfaces/aztec-node-admin.ts`
- Server: `yarn-project/aztec-node/src/aztec-node/server.ts`
- Worker template: `yarn-project/end-to-end/src/test-wallet/worker_wallet.ts` + `wallet_worker_script.ts`
- Transport classes: `yarn-project/foundation/src/transport/node/`
- Longform plan: `/mnt/user-data/alexg/.claude/plans/hey-friend-i-would-humming-kernighan.md`
- Session handoff: `/mnt/user-data/alexg/.claude/plans/tier-a-handoff.md`

---

## Session log

- **Session 1** (shipped): setup() env-var refactor. Commit `05ffdac659`.
- **Session 2** (shipped): delayer RPCs on `AztecNodeDebug`. Commit `5f3f7ff462`.
- **Session 3** (planned): `NodeWorker` + `RemoteDateProvider` + setup() wire-up + call-site migration + verification.
