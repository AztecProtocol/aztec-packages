# Failed TX Store: Gas Pricing & Timing

## What this branch does

Adds gas pricing, timing, and L1 fee environment data to the `L1TxFailedStore` so operators can answer: **"Did I underprice my tx? If so, by how much?"** and **"Did I send it too late in my slot?"**

## Changes made (all code is written)

### 1. `yarn-project/sequencer-client/src/publisher/l1_tx_failed_store/failed_tx_store.ts`
- Added `gasInfo` field to `FailedL1Tx` with: `sentGasPrice`, `gasLimit`, `nonce`, L1 base/blob fees, pending pool p75 priority fees, and `nextMinedBlock` (min included priority fee from the next mined block — the definitive underpricing threshold)
- Added `timing` field with: `targetL2Slot`, `slotDeadlineTimestampS`, `msUntilSlotDeadline`
- Added `'timeout'` failure type (tx sent but never mined before slot deadline)

### 2. `yarn-project/ethereum/src/l1_tx_utils/l1_fee_analyzer.ts`
- Added standalone `captureFeeSnapshot(client)` — instant 3-RPC-call snapshot of pending pool fees
- Added `captureNextMinedBlockFees(client, blockNumber)` — waits up to 15s for the next block and extracts `minIncludedPriorityFee`, `minIncludedBlobPriorityFee`, `blockBlobsFull`
- Extracted `minBigInt` from class method to file-level function (reused by both the class and the new standalone functions)

### 3. `yarn-project/ethereum/src/contracts/multicall.ts`
- `MulticallForwarderRevertedError` now carries `txState?: L1TxState` (gas price, nonce, gas limit)
- `Multicall3.forward()` captures and returns `state` from `sendAndMonitorTransaction`

### 4. `yarn-project/sequencer-client/src/publisher/sequencer-publisher.ts`
- Added `computeTimingInfo()` — computes slot deadline and time remaining
- Rewrote `backupFailedTx()` — when `captureFeeSummary: true`, async-captures fee snapshot + waits for next mined block before saving (fire-and-forget, doesn't block critical path)
- Added `backupRevertFailure()` — backs up on-chain reverts with `sentGasPrice` from `L1TxState`
- Added `backupSendFailure()` — backs up send errors (tx never reached chain) with fee snapshot
- Updated all 3 existing `backupFailedTx` call sites with `timing` and `captureFeeSummary: true`
- Added `TimeoutError` backup in `sendRequests` catch block
- Threaded `targetSlot` through `forwardWithPublisherRotation` and `backupDroppedInSim`

## What still needs to be done

1. **Build and verify** — `yarn build` from `yarn-project/` to confirm compilation
2. **Run existing tests** — `yarn workspace @aztec/sequencer-client test` and `yarn workspace @aztec/ethereum test`
3. **Format and lint** — `yarn format && yarn lint` from `yarn-project/`
4. **Fix any type errors** — the code was written without being able to build locally (noir submodule issue on the authoring machine)

## Key design decisions

- `timing.failureTimestampMs` was deliberately omitted — it would duplicate the existing `FailedL1Tx.timestamp`
- `nextMinedBlock` data is captured asynchronously (waits ~12s for next L1 block) but this runs fire-and-forget inside `backupFailedTx` so it never blocks the sequencer
- For `timeout` failures, `sentGasPrice` is not captured directly (the gas price is deep in the L1TxUtils call stack). The fee snapshot alone shows what the operator was competing against, and the sent gas price is in structured logs
- Gas pricing on `revert` failures is captured for context but operators should know the tx *was included* — it's not an underpricing issue

## Interpretive guide

| `failureType` | `sentGasPrice`? | How to diagnose underpricing |
|---|---|---|
| `simulation` | No | Check `pendingP75PriorityFee` vs your config |
| `send-error` | No | Compare `nextMinedBlock.minIncludedPriorityFee` vs your config — this is what you needed |
| `timeout` | No | Same as send-error — tx sat in mempool, `minIncludedPriorityFee` is the bar |
| `revert` | Yes | Not underpriced. Check `error.name` for contract revert reason |

## Base branch

This branch is based on `next` and should target `merge-train/spartan` for PR.
