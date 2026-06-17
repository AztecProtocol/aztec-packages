# Sentinel

The Sentinel watches every committee member's behaviour each L2 slot, aggregates it into per-epoch performance once each epoch is fully observed, and emits inactivity slash payloads to the slasher.

## Responsibilities

- Classify per-slot proposer/attestor behaviour from local node observations.
- Persist a sliding window of per-slot history per validator.
- Roll up that history into per-epoch performance after each epoch ends.
- Decide which validators have been inactive for `slashInactivityConsecutiveEpochThreshold` consecutive epochs and emit `WANT_TO_SLASH_EVENT` with `OffenseType.INACTIVITY`.
- Expose validator stats to RPC consumers (`getValidatorStats`, `computeStats`).

The sentinel is one of several watchers registered with the slasher; it does not vote or publish to L1 itself.

## Inputs

| Source | What it provides |
|---|---|
| `EpochCache` | Slot/epoch helpers, committee + proposer for a slot, escape-hatch state |
| `L2BlockSource` (archiver) | Synced slot, `getCheckpoint({ slot })`, `getL2Tips()`, block headers |
| `P2PClient` | `getCheckpointAttestationsForSlot(slot, payloadHash)`, `hasBlockProposalsForSlot(slot)` |
| `CheckpointReexecutionTracker` | Local re-execution outcome for the proposal at each slot (`valid` / `invalid` / `unvalidated`) — populated by the validator client's `ProposalHandler` |
| L1-confirmed checkpoints | Fetched on demand per slot via `archiver.getCheckpoint({ slot })`, yielding the canonical attestor set |

## Two cadences

`Sentinel.work()` runs every quarter L2 slot and drives two pipelines that operate independently:

### 1. Per-slot recording (lag = 2 slots)

`processSlot(currentSlot - 2)` runs once per slot. The 2-slot lag gives P2P attestations time to settle and lets the archiver catch up. It calls `getSlotActivity(slot, epoch, proposer, committee)` and writes per-validator statuses to `SentinelStore.historyMap`. History is a sliding window of `sentinelHistoryLengthInEpochs * epochDuration` slots (default 24 epochs).

If `EpochCache.getCommittee(slot)` reports `isEscapeHatchOpen`, the slot is recorded as processed without writing any per-validator entries.

### 2. Per-epoch evaluation (lag = `sentinelEpochEndBufferSlots` past the epoch's last slot)

`processEpochEnds(currentSlot)` checks whether any epoch is now fully observable and not yet evaluated. An epoch is eligible once both:

- the buffer has elapsed: `currentSlot − sentinelEpochEndBufferSlots ≥ lastSlotOfEpoch`, and
- per-slot recording has reached the epoch's last slot: `lastProcessedSlot ≥ lastSlotOfEpoch`.

When eligible, `handleEpochEnd(epoch)` aggregates the slot-level statuses for that epoch into per-validator `{missed, total}`, persists the result to `SentinelStore.epochMap` (default 2000-epoch window), and runs the inactivity check.

The aggregator catches up if multiple epochs become eligible at once (e.g. after a long backoff).

## Six-case taxonomy

For each slot, the proposer is assigned one of six statuses, ranked highest-confidence first:

| # | Status | Trigger | Inactive party |
|---|---|---|---|
| 6 | `checkpoint-mined` | `archiver.getCheckpoint({ slot })` returns a checkpoint (one covering this slot has landed on L1) | Attestors who didn't attest |
| 5 | `checkpoint-valid` | `tracker.getOutcomeForSlot(slot) === 'valid'` | Attestors who didn't attest |
| 4 | `checkpoint-invalid` | `tracker.getOutcomeForSlot(slot) === 'invalid'` (re-executed and rejected) | Proposer |
| 3 | `checkpoint-unvalidated` | `tracker.getOutcomeForSlot(slot) === 'unvalidated'` (validation aborted: missing data, timeout, etc.) | Proposer |
| 2 | `checkpoint-missed` | `p2p.hasBlockProposalsForSlot(slot)` true (blocks seen but no checkpoint proposal observed) | Proposer |
| 1 | `blocks-missed` | None of the above (no block proposals observed) | Proposer |

Missing-attestor faults are only recorded in cases 5 and 6 — where the local node has positive evidence the checkpoint was valid or canonical. In cases 1–4 the proposer is at fault and no attestor penalty applies.

Each non-proposer committee member is tagged:

- `attestation-sent` — attestation seen on P2P (with valid signature) or in the L1 checkpoint's attestor set
- `attestation-missed` — only when proposer status is case 5 or 6 and the validator's attestation was not seen
- none — otherwise

## Inactivity slashing

`handleEpochPerformance(epoch, performance)`:

1. Filter validators where `missed / total ≥ slashInactivityTargetPercentage`.
2. For each, call `checkPastInactivity` to require `slashInactivityConsecutiveEpochThreshold − 1` past epochs (from `SentinelStore.epochMap`) over the same threshold. Epochs where the validator was not on a committee are skipped, not counted against the streak.
3. Emit a single `WANT_TO_SLASH_EVENT` with one `WantToSlashArgs` per qualifying validator.

`{missed, total}` only counts slots that had something happen (a proposal, an attestation, or a missed proposal opportunity). Slots where the validator was on the committee but no proposal occurred and they were not the proposer don't show up in either count — that prevents an offline validator from appearing as "5/10 missed" simply because half the epoch had no proposals.

## Storage

`SentinelStore` is an LMDB-backed KV store with two maps:

- `historyMap` — validator address → serialized `[(slot, status)]` rolling window
- `epochMap` — validator address → serialized `[{epoch, missed, total}]` rolling window

`SCHEMA_VERSION` controls on-disk compatibility; bumping it wipes the store on next open. The encoded status numbers live in `SentinelStore.statusToNumber`/`statusFromNumber`.

## Configuration

| Key | Env var | Default | Purpose |
|---|---|---|---|
| `sentinelEnabled` | `SENTINEL_ENABLED` | `false` | Master switch |
| `sentinelHistoryLengthInEpochs` | `SENTINEL_HISTORY_LENGTH_IN_EPOCHS` | `24` | Slot-history window, in epochs |
| `sentinelHistoricEpochPerformanceLengthInEpochs` | `SENTINEL_HISTORIC_EPOCH_PERFORMANCE_LENGTH_IN_EPOCHS` | `2000` | Per-epoch performance window |
| `sentinelEpochEndBufferSlots` | `SENTINEL_EPOCH_END_BUFFER_SLOTS` | `2` | Slots to wait past an epoch's last slot before evaluating it |

The sentinel also reads slashing thresholds and L1 chain identifiers from `SentinelRuntimeConfig` (see `sentinel.ts`).

## Files

- `sentinel.ts` — main class
- `store.ts` — KV-backed persistence
- `config.ts` — `SentinelConfig` and env-var mappings
- `factory.ts` — `createSentinel` factory used by `AztecNodeService`
- `sentinel.test.ts` / `store.test.ts` — unit tests
