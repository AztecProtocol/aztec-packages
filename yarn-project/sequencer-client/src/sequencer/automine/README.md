# AutomineSequencer

A minimal, deterministic, queue-driven sequencer for e2e tests that do not exercise block-building or consensus mechanics (e.g. `e2e_token`, `e2e_amm`, `e2e_authwit`).

## When to use it

Use `AutomineSequencer` (via `AUTOMINE_E2E_OPTS`) for single-sequencer tests that care about contract logic, not about proposer selection, attestations, pipelining, or multi-validator coordination. It bypasses all of that machinery.

Use the production `Sequencer` (via `PIPELINING_SETUP_OPTS` or the default) for tests that explicitly exercise consensus, validator rotation, P2P gossip, slashing, or multi-node behavior.

**Requirement**: the deployed rollup must have `aztecTargetCommitteeSize == 0`. This causes `Rollup.verifyProposer` / `verifyAttestations` on L1 to short-circuit and accept an empty `CommitteeAttestationsAndSigners`, which is what `AutomineSequencer` always sends.

## What it omits

Compared to the production `Sequencer`:

- No proposer-turn check (single sequencer, always proposes).
- No sync check, no pipelining, no timetable enforcement.
- No validator orchestration, attestation collection, or P2P proposal gossip.
- No slashing, no governance votes, no `SequencerEvents`.

Consumers (archiver, world-state, `EpochTestSettler`) observe L1 and the archiver tip directly rather than listening for sequencer events.

## Serial-queue invariant

Every operation — mempool-driven block builds, explicit empty-block builds, time warps, and reorgs — is serialized through a single `SerialQueue`. They never interleave.

Public entry points:

| Method | Description |
| --- | --- |
| `buildIfPending()` | Enqueues a mempool-driven build. Coalesces bursts into one job. |
| `buildEmptyBlock()` | Enqueues a forced empty-block build. |
| `warpTo(ts)` / `warpBy(delta)` | Advances L1 time to a slot boundary. |
| `revertToCheckpoint(n)` | Rolls L1 back to the block that published checkpoint `n`, then resets archiver, world-state, and P2P pool. |
| `syncPoint()` | Awaits the queue reaching idle. |

## Entry points

**Factory** — `createAutomineSequencer` in `automine_factory.ts` wires up all dependencies (publisher manager, keystore, cheat codes, etc.), starts the `PublisherManager`, and returns an unstarted `AutomineSequencer`. The caller (`AztecNodeService.createAndSync` in `aztec-node/src/aztec-node/server.ts`) invokes `AutomineSequencer.start()` separately. It is called by the full node when `aztecTargetCommitteeSize == 0`.

**Test fixture** — `AUTOMINE_E2E_OPTS` in `end-to-end/src/fixtures/fixtures.ts` is the test-side entry point. Pass it to `setup()` to get a node + `AutomineSequencer` instead of the production sequencer stack.

## Epoch proving caveat

Epoch proving remains manual under `AUTOMINE_E2E_OPTS`. The e2e `setup()` fixture does NOT wire an `EpochTestSettler` — that observer is only attached in `local-network.ts`. Tests that cross epoch boundaries must therefore advance the proven anchor explicitly via `cheatCodes.rollup.markAsProven(...)`. See `e2e_lending_contract.test.ts` (which calls `progressSlots` in `simulators/lending_simulator.ts`) and `e2e_pruned_blocks.test.ts` for real examples.
