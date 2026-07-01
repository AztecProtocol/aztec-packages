# Failed TX Store: Gas Pricing & Timing

## What this branch does

Adds gas pricing, timing, and L1 fee-environment data to failed-L1-tx records so operators can answer
**"Did I underprice my tx, and by how much?"** and **"Did I send it too late in my slot?"**

The core idea: when a proposal fails, record — per attempt — the gas price(s) the sequencer used (a
single price, or the full escalation **ladder** for a timeout), and the fee conditions of the **L1
inclusion window** it was competing in (the set of L1 blocks that could have included a tx for that L2
slot). Comparing the two tells you directly whether you were underpriced.

## The inclusion window

An L2 slot N maps to a contiguous run of L1 slots. With the deployed 72s L2 slot / 12s L1 slot config
that is **6 L1 blocks**: M, M+1, … , M+5.

- The sequencer aims to be in the mempool one L1 slot before N starts, so block M can pick it up.
- Valid inclusion is exactly {M … M+5}. Being included in M-1 reverts (`HeaderLib__InvalidSlotNumber`);
  M+6 belongs to the next L2 slot / proposer.
- Window as a timestamp range: `[getTimestampForSlot(N), getTimestampForSlot(N+1))`.

So the fees that mattered to your tx are the fees of blocks M … M+5 — not "the next block after the
failure" (for a timeout that would be M+6, the *next* slot, which is irrelevant).

## The gas-price ladder

Underpriced txs don't revert — they time out. When a tx is stuck, `L1TxUtils.monitorTransaction` **speeds
it up**: it escalates the priority fee, re-signs at the same nonce, and rebroadcasts, up to
`maxSpeedUpAttempts` times, then (if `cancelTxOnTimeout`) fires a cancellation to clear the nonce. So the
"what I paid" side of a timeout isn't a single number — it's a **ladder** of escalating prices.

Those intermediate prices exist only in memory during the loop: each speed-up replaces the prior tx at
the same nonce, so the earlier attempts are evicted from the mempool and never mined — they can't be
recovered afterward. To capture the ladder we therefore retain it on the tx state as it's built.

To keep that retention out of the shared hot path when the diagnostic is off, it is **gated by the same
`L1_TX_FAILED_STORE` flag** that enables the store: `SequencerPublisher` sets
`L1TxUtils.captureGasPriceHistory` on its publishers only when a store is configured. Flag off (the
default) → `monitorTransaction` runs exactly as before and no backup work happens; flag on → the ladder
is retained, surfaced on timeout, and written to the record. The cancellation tx itself is a planned
follow-up (it fires fire-and-forget, so it needs its own hook rather than a throw-time snapshot).

## Changes made

### 1. `yarn-project/sequencer-client/src/publisher/l1_tx_failed_store/failed_tx_store.ts`
- `FailedL1Tx.failureType` gained `'timeout'` (tx sent but never mined before the slot deadline).
- `FailedL1Tx.gasInfo` (optional): `sentGasPrice`, `gasLimit`, `nonce`, L1 base/blob fees, pending-pool
  p75 priority fees + counts (a send-time snapshot), and **`windowBlocks[]`** — per-block fee data for
  each L1 block in the slot's inclusion window, chronologically. Each entry has `blockNumber`,
  `timestamp`, `baseFeePerGas`, `p75PriorityFee`, `minIncludedPriorityFee`, `minIncludedBlobPriorityFee`,
  `blockBlobsFull`, `includedBlobTxCount`, `includedBlobCount`. May be partial or empty if the window
  wasn't mined yet when the record was written (e.g. an early send failure).
- `FailedL1Tx.gasInfo` also carries **`sentGasPriceLadder[]`** (the escalating prices used across the
  initial send and each speed-up, for timeouts) and **`attempts`** (send count = initial + speed-ups).
- `FailedL1Tx.timing` (optional): `targetL2Slot`, `slotDeadlineTimestampS`, `msUntilSlotDeadline`.

### 2. `yarn-project/ethereum/src/l1_tx_utils/l1_fee_analyzer.ts`
- `captureFeeSnapshot(client)` — point-in-time snapshot of pending-pool fee conditions (base fees,
  pending p75 priority fees, pool counts). Never throws.
- `captureWindowBlockFees(client, windowStartS, windowEndS)` — walks back from the chain head reading the
  **already-mined** blocks whose timestamps fall in `[windowStartS, windowEndS)` and extracts per-block
  fee data. Historical reads only — it never waits on a future block. Returns them chronologically, `[]`
  on error, or the subset mined so far if the window is still in progress. Bounded by
  `MAX_WINDOW_SCAN_BLOCKS`. Never throws.
- `minBigInt` hoisted from a class method to a file-level function (shared by the class and the new fns).

### 3. `yarn-project/ethereum/src/contracts/multicall.ts`
- `MulticallForwarderRevertedError` carries `txState?: L1TxState` (gas price, nonce, gas limit).
- `Multicall3.forward()` captures and returns `state` from `sendAndMonitorTransaction`.

### 4. `yarn-project/ethereum/src/l1_tx_utils/` (`config.ts`, `types.ts`, `l1_tx_utils.ts`)
- `L1TxUtilsConfig.captureGasPriceHistory` (new, env-less, default `false`) — gate for ladder retention.
- `L1TxState.gasPriceHistory?: GasPrice[]` — the escalation ladder, **in-memory only** (not persisted by
  the state store; the field-explicit serializer simply ignores it).
- `monitorTransaction` initializes the ladder at send (only when the flag is on) and pushes each speed-up
  price; the push is `state.gasPriceHistory?.push(...)`, a no-op when the flag is off.
- `L1TxTimeoutError extends TimeoutError` carries a `TimedOutTxState` snapshot (`gasPriceHistory`,
  `finalGasPrice`, `attempts`, `nonce`, `gasLimit`). `sendAndMonitorTransaction` wraps
  `monitorTransaction` and rethrows `TimeoutError → L1TxTimeoutError` with a snapshot taken *before* the
  fire-and-forget cancellation mutates the state. Subclassing keeps every `instanceof TimeoutError` check
  working (the rethrow in `forwardWithPublisherRotation` and the `sendRequests` catch).

### 5. `yarn-project/sequencer-client/src/publisher/sequencer-publisher.ts`
- `computeTimingInfo(targetL2Slot)` — computes the slot deadline and time remaining.
- `captureFeeEnvironment(targetL2Slot)` — builds `gasInfo` from a pending snapshot plus, when a slot is
  given, `windowBlocks` for that slot's inclusion window.
- Sets `captureGasPriceHistory = !!config.l1TxFailedStore` on its primary publisher and every rotation
  publisher (via `updateConfig`), so the existing `L1_TX_FAILED_STORE` flag also gates ladder retention —
  no new config.
- `backupFailedTx(failedTx, opts)` — fire-and-forget backup. `opts.captureFeeSummary` captures the fee
  environment for `opts.targetSlot`; `opts.sharedFeeSummary` reuses a pre-captured summary so a batch of
  failures in the same slot doesn't re-read the window per record. Gates on the **resolved** store, so no
  capture/RPC work runs when no store is configured (fixes a latent guard that checked the
  always-assigned promise and so never fired).
- `failureRecordId(actions, targetSlot)` — id for synthetic records (send-error/timeout) that have no
  on-chain tx hash. Folds the failure time in, so each attempt — **including retries of the same slot** —
  is stored as its own record instead of overwriting the previous one.
- `backupRevertFailure()` / `backupSendFailure()` — back up on-chain reverts (with `sentGasPrice` from
  `L1TxState`) and send failures (tx never reached chain), both guarded against unhandled rejections.
- `TimeoutError` backup in the publish catch block, guarded so a degraded RPC can't leak a rejection.
  When the error is an `L1TxTimeoutError`, its `txState` is turned into `gasInfo.sentGasPriceLadder` +
  `attempts` on the record.
- `backupDroppedInSim()` captures the fee environment **once per invocation** and shares it across all
  dropped-action records (was: one capture per dropped action), gates on the resolved store, and is
  wrapped so it can't throw.

## Status

- Implemented; the `ethereum` package typechecks clean and both packages lint clean.
- Unit tests pass: `window_block_fees.test.ts` (in-window filtering, chronological order, partial window,
  empty-before-window, per-block min/p75, never-throws) and `l1_tx_timeout_error.test.ts` (locks the
  `L1TxTimeoutError instanceof TimeoutError` contract the publish-path propagation depends on).
- Integration tests pass:
  - `gas_price_ladder.test.ts` (anvil) — drives a real send→speed-up→timeout and asserts the escalating
    ladder is captured and surfaced on `L1TxTimeoutError` (and that the flag gates retention).
  - `sequencer-publisher.test.ts` — drives `sendRequests` through a `L1TxTimeoutError` into a real
    file-backed store and reads the persisted record back, asserting `sentGasPriceLadder` + `attempts`.
- A full cross-package `sequencer-client` typecheck is currently blocked by pre-existing `rollup.ts`
  ABI-artifact errors (ungenerated `l1-artifacts`), unrelated to this change.

## Key design decisions

- **Window, not "next block".** The blocks that mattered (M … M+5) are already mined by the time a
  timeout is detected, so we read them historically rather than polling for a future block. This is
  correct for the dominant failure mode *and* removes the RPC-amplification risk of stacking long pollers
  during a fee spike.
- **Once per slot, shared.** All attempts (and all dropped-in-sim entries) in one slot share the same
  window, so the window is read once and attached to each record.
- **One record per attempt.** Synthetic ids include the failure time, so retries within a slot are each
  preserved rather than clobbering one another.
- **Ladder retention reuses the store flag and is in-memory only.** The escalation ladder can't be
  reconstructed after the fact (replaced txs are evicted), so it's retained during the loop — but only
  when `L1_TX_FAILED_STORE` is set, so the shared hot path is untouched by default. It's not persisted to
  the state store (a diagnostic isn't worth growing the LMDB blob or the crash-recovery path).
- **Never on the critical path.** All capture is fire-and-forget; the capture functions never throw and
  the backup paths are guarded, so nothing here can block or crash block publishing.
- `timing.failureTimestampMs` is omitted — it would duplicate `FailedL1Tx.timestamp`.
- On `revert`, `sentGasPrice` is captured for context, but the tx *was included* — it's a contract
  revert, not underpricing.

## Interpretive guide

Compare what was paid against the window bar (`windowBlocks[].minIncludedPriorityFee`):

| `failureType` | What was paid | How to diagnose underpricing |
|---|---|---|
| `simulation` | — | Entry reverted in sim; not a pricing issue. Check `error` / `pendingP75PriorityFee`. |
| `send-error` | — | Tx never reached chain. Compare your configured priority fee vs `windowBlocks[].minIncludedPriorityFee`. |
| `timeout`    | `sentGasPriceLadder[]` | Tx sat in mempool through M … M+5. Check whether the *top* of `sentGasPriceLadder` ever cleared `windowBlocks[].minIncludedPriorityFee`; if not, you were underpriced across all `attempts`. |
| `revert`     | `sentGasPrice` | Not underpriced — tx was included. Check `error.name` for the contract revert reason. |

`sentGasPriceLadder` is only present when `L1_TX_FAILED_STORE` is configured. `blockBlobsFull` on a
window block tells you whether you lost the block to blob-space contention rather than priority fee.

## Base branch

This branch is based on `next` and should target `merge-train/spartan` for PR.
