---
title: Block Production and Finality
sidebar_position: 3.5
tags: [protocol]
description: How Aztec produces blocks in slots and checkpoints, what each transaction status means, and how to choose the right finality level for your app.
references: ["yarn-project/stdlib/src/tx/tx_receipt.ts", "yarn-project/aztec.js/src/contract/wait_opts.ts", "yarn-project/pxe/src/config/index.ts"]
---

On this page you'll learn:

- How Aztec produces multiple blocks per slot and groups them into checkpoints
- What each transaction status (`proposed`, `checkpointed`, `proven`, `finalized`) means and when it can revert
- How to choose which status to wait for in Aztec.js
- How to configure which chain tip your PXE syncs to

## Overview

Aztec separates *block production* from *L1 publication*. Sequencers build new L2 blocks every few seconds and propagate them over the p2p network, but they publish to Ethereum only once per slot, as a single **checkpoint** that bundles all the blocks built during that slot. This is how the network gets low block times without paying for an L1 transaction per block.

The hierarchy, from smallest to largest unit:

1. **Transaction**: a proven private execution plus any enqueued public calls
2. **Block**: an ordered set of transactions with a state root, built and propagated over p2p every few seconds
3. **Checkpoint**: all the blocks built during one slot, posted to L1 in a single transaction
4. **Epoch**: a fixed number of consecutive slots (32 on current networks), proven together by a single rollup proof submitted to L1

## Slots and checkpoints

Time on Aztec is divided into **slots**. On the current testnet a slot is 72 seconds (slot duration is per-network configuration, not a protocol constant). For each slot, one sequencer is pseudorandomly selected as the proposer, using randomness from Ethereum (RANDAO).

During its slot, the proposer:

1. Builds a block from pending transactions every few seconds, propagating each block to the committee over p2p for attestation
2. Keeps building blocks while there are transactions in the mempool and time left in the slot
3. Near the end of the slot, bundles everything it built into a checkpoint and submits it to L1

How many blocks end up in a checkpoint is demand-driven. Each block requires a minimum number of pending transactions (by default just one), so under low load a checkpoint may contain a single block, and a slot with no transactions at all may produce no checkpoint. Under sustained load, the proposer builds blocks back-to-back up to a per-network maximum derived from the slot duration and the target block time (on the order of 10 to 20 blocks per checkpoint for current configurations).

Sequencers are economically incentivized to publish: checkpoint rewards are only earned for checkpoints that land on L1, and validators that repeatedly fail to propose or attest, or that withhold checkpoint data, can have their stake slashed.

## Transaction statuses

Query a transaction's status by calling `getTxReceipt` on the node with the transaction's hash. The receipt's `status` field is one of six values, ordered by lifecycle progress:

| Status | Meaning | Can it revert? |
| --- | --- | --- |
| `dropped` | The node does not know the transaction: it was evicted from the mempool or never arrived | Terminal (can be resubmitted) |
| `pending` | In the mempool, not yet included in a block | Can be dropped |
| `proposed` | A sequencer included it in a block and propagated the block via p2p; not yet on L1 | Yes: if the checkpoint never lands on L1 (missed slot, failed L1 transaction), the block is pruned and the transaction returns to pending |
| `checkpointed` | The block was included in a checkpoint that landed on L1 | Yes, but only if the epoch's proof misses its submission deadline, in which case unproven checkpoints are pruned |
| `proven` | The epoch containing the block was proven and the proof was posted to and verified on L1 | Only by an Ethereum reorg |
| `finalized` | The proof's L1 transaction is in a finalized Ethereum block | No |

Two things worth internalizing:

- A `proposed` transaction already has a real `blockNumber`: block numbers are assigned when blocks are built, before anything reaches L1.
- `checkpointed` is not final. If provers fail to prove an epoch within the proof submission window (about two epochs), the rollup contract allows the unproven checkpoints to be pruned and their transactions revert to the mempool. This is rare on a healthy network, but applications handling significant value should not treat `checkpointed` as irreversible.

## Choosing what to wait for

There is a latency/finality trade-off in choosing which status to act on:

- **`proposed`** (seconds): best for interactive UX, such as optimistically updating a balance in a wallet UI. Carries the risk that the checkpoint never lands and the transaction silently returns to pending.
- **`checkpointed`** (up to about a slot, ~72 seconds): the block is on L1 and its data is available. Reverts only in the unlikely event of a missed epoch proof deadline. A sensible default for most applications, and the Aztec.js default.
- **`proven`** (up to a few epochs, tens of minutes to about an hour): backed by a validity proof verified on Ethereum. Appropriate for high-value actions, such as crediting a deposit on an exchange.
- **`finalized`** (proven plus L1 finality, ~13 more minutes): irreversible. Required for anything that bridges value out to L1 or cannot tolerate any reorg.

### Waiting in Aztec.js

By default, `send()` waits until the transaction reaches `checkpointed` (or any later status) before resolving. Pass `waitForStatus` in the `wait` options to change this:

```typescript
import { TxStatus } from "@aztec/aztec.js/tx";

// Resolve as soon as a sequencer proposes a block containing the tx (fastest, weakest guarantee)
await token.methods.transfer(recipient, amount).send({
  from: sender.address,
  wait: { waitForStatus: TxStatus.PROPOSED },
});

// Resolve only once the epoch containing the tx is proven on L1
await token.methods.transfer(recipient, amount).send({
  from: sender.address,
  wait: { waitForStatus: TxStatus.PROVEN, timeout: 3600 },
});
```

The same option is accepted by `waitForTx` from `@aztec/aztec.js/node` when you have a transaction hash rather than a contract interaction. The default wait `timeout` is 300 seconds; waiting for `proven` or `finalized` usually requires raising it, since proving completes on epoch boundaries.

### Reading chain state at a given finality

Node query methods that accept a block parameter take a **block tag** alongside explicit block numbers: `latest`, `proposed`, `checkpointed`, `proven`, or `finalized` (`latest` is an alias for `proposed`). The node tracks all four tips simultaneously, so you can, for example, read a balance as of the proven tip while the proposed tip is several blocks ahead.

## PXE sync target

The PXE keeps its own view of the chain and has a separate knob for which tip it syncs to. This is a different axis from `waitForStatus`: one controls what your `wait()` call resolves on, the other controls what state the PXE's local database (notes, nullifiers, block headers) reflects when simulating transactions and reading private state.

| Config | Env var | Values | Default |
| --- | --- | --- | --- |
| `syncChainTip` | `PXE_SYNC_CHAIN_TIP` | `proposed`, `checkpointed`, `proven`, `finalized` | `proposed` |
| `autoSync` | `PXE_AUTO_SYNC` | `true`, `false` | `true` |

With the default `proposed`, the PXE sees new notes as soon as blocks propagate over p2p, so a user can spend the output of a transaction seconds after sending it. The cost is that the PXE may have to unwind state if proposed blocks are pruned.

Syncing to `checkpointed` or `proven` gives the PXE a more stable view: it will never see state that later reverts (short of a missed proof deadline or L1 reorg respectively), at the cost of lagging the head of the chain by up to a slot or an epoch. Wallets that want to drive syncing themselves can set `autoSync` to `false` and call `pxe.sync()` explicitly.

## Next steps

- Follow the [transaction lifecycle](./transactions.md) from user intent to L2 block
- Send transactions and query receipts with [Aztec.js](../aztec-js/how_to_send_transaction.md)
- See the [migration notes](../resources/migration_notes.md) for recent changes to checkpoint-related node APIs
