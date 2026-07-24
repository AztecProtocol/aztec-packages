# Aztec Gas and Fee Model

The minimum fee per mana and its components are computed on L1 in
`l1-contracts/src/core/libraries/rollup/FeeLib.sol` (`fee_math.ts` in this directory is a
TypeScript port of those formulas, used to predict fees a few slots ahead). This document
describes the formulas, the oracle lag/lifetime mechanism, how a transaction's fee is
derived from them, the gas and data limits, and the TypeScript types in this directory.

## Mana

Aztec meters work as gas in two dimensions: **DA** (data availability, i.e. blob data
published to L1) and **L2** (execution). The L2 dimension is called **mana** (analogous to
Ethereum gas): block headers track `totalManaUsed`, and the fee model below prices one unit
of mana. The total fee is `gasUsed * feePerGas` summed across both dimensions.

### The DA dimension is priced at zero

Only the L2 dimension currently carries a price. When building checkpoint global variables,
the sequencer sets `feePerDaGas = 0` and sets `feePerL2Gas` to the L1-computed minimum fee
per mana (`sequencer-client/src/global_variable_builder/global_builder.ts` and
`fee_provider.ts` in the same directory). The cost of publishing data is still recovered:
the blob gas a checkpoint pays on L1 is part of the *sequencer cost* component of the mana
fee below. DA gas remains fully metered and limited (see
[Gas and Data Limits](#gas-and-data-limits)) — it bounds how much data a tx or checkpoint
may publish — it just contributes nothing to the fee today.

## Fee Components

The minimum fee per mana has four components. All are computed in ETH (wei) per mana and
converted to the fee asset at the end (see [Fee Asset Price](#fee-asset-price)).

### Sequencer Cost

L1 cost to propose a checkpoint (calldata gas + blob data), amortized over `manaTarget`:

```
sequencerCost = ceil(((L1_GAS_PER_CHECKPOINT_PROPOSED * baseFee)
              + (BLOBS_PER_CHECKPOINT * BLOB_GAS_PER_BLOB * blobFee))
              / manaTarget)
```

Note that `BLOBS_PER_CHECKPOINT` here is FeeLib's own constant (3), not the protocol blob
capacity of the same name (6) — see the note under [Key Constants](#key-constants).

### Prover Cost

L1 cost to verify an epoch proof, amortized over epoch duration and `manaTarget`, plus a
governance-set proving cost that compensates for off-chain proof generation:

```
proverCost = ceil(ceil((L1_GAS_PER_EPOCH_VERIFIED * baseFee) / epochDuration) / manaTarget)
           + provingCostPerMana
```

Updates to `provingCostPerMana` are rate-limited on L1 (`FeeLib.updateProvingCostPerMana`):
at most one update every 30 days, each moving the value by at most ×1.5 (or ÷1.5), with a
floor of 2 wei per mana.

### Congestion Cost

An exponential surcharge when the network is congested (inspired by EIP-1559; the
implementation uses the `fakeExponential` Taylor series approximation from EIP-4844):

```
baseCost       = sequencerCost + proverCost
congestionCost = floor(baseCost * congestionMultiplier / MINIMUM_CONGESTION_MULTIPLIER) - baseCost
```

When there is no congestion the multiplier equals `MINIMUM_CONGESTION_MULTIPLIER` (1e9)
and congestion cost is zero.

### Congestion Multiplier

```
excessMana           = max(0, prevExcessMana + prevManaUsed - manaTarget)
denominator          = manaTarget * 854,700,854 / 1e8    ≈ 8.547 * manaTarget
congestionMultiplier = fakeExponential(MINIMUM_CONGESTION_MULTIPLIER,
                                       min(excessMana, 100 * denominator), denominator)
```

Each additional `manaTarget` of excess mana multiplies the fee by `e^(1/8.547) ≈ 1.124`,
i.e. ~12.5%. The exponent is capped at 100 (multiplier ≤ ~2.7e43 × the minimum) to keep
the Taylor series from overflowing.

### Total

```
minFeePerMana = sequencerCost + proverCost + congestionCost
```

Each component is converted from ETH to the fee asset individually (rounding up) before
summing. The sum is capped at `type(uint128).max` (`FeeLib.summedMinFee`) so it always fits
the proposal header's `feePerL2Gas` field — without the cap, extreme congestion could
produce a fee no valid header can represent, halting the chain.

## L1 Gas Oracle: Lag and Lifetime

The oracle feeds Ethereum's `baseFee` and `blobFee` into the fee model using a two-phase
(`pre` / `post`) system that smooths out L1 fee volatility.

- **LAG = 2 slots** — when new L1 fees are observed, they activate `LAG` slots later
  (`slotOfChange = currentSlot + LAG`). This gives mempool transactions time to land
  before fees change.
- **LIFETIME = 5 slots** — after an oracle update, further updates are ignored
  (`updateL1GasFeeOracle` returns without effect) until `slotOfChange + (LIFETIME - LAG)`
  = 3 more slots have passed. This rate-limits how frequently L1 fee data can change.

Fee resolution at a given timestamp:

```
if slot < slotOfChange  →  use pre  (old fees)
else                    →  use post (new fees)
```

**Net effect**: L1 fee changes reach L2 with a 2-slot delay and can update at most once
every 5 slots.

Because queued values only activate `LAG` slots later, the min fee for the next `LAG`
slots is fully determined by current on-chain state. `fee_math.ts` ports the FeeLib
formulas so the sequencer can predict min fees over that window (the prediction math in
`fee_prediction.ts` in `sequencer-client/src/global_variable_builder`), under a configurable
mana-usage assumption (`ManaUsageEstimate`: none / target / limit). See
[Serving Fee Quotes](#serving-fee-quotes-the-fee-snapshot) for how those predictions are cached
and served without per-request L1 round trips.

### Worked Example

Suppose the oracle is updated at slot 10 with new L1 fees. Here is the timeline:

```
Slot  Oracle state          Active fees   Notes
────  ────────────────────  ────────────  ──────────────────────────────────
 10   pre=A, post=B, soc=12   A           Update queued. slotOfChange = 10 + LAG = 12.
 11   (same)                  A           Still before slotOfChange → pre (A).
 12   (same)                  B           slot >= slotOfChange → post (B) activates.
 13   (same)                  B           B remains active.
 14   (same)                  B           B remains active.
 15   Update allowed again    B           Earliest next update: soc + (LIFETIME - LAG)
                                          = 12 + 3 = 15.
```
 
Key observations:

1. **Slots 10-11**: The old fees (A) are still in effect. Transactions submitted during
   these slots see the old L1 cost. This is the **LAG** window — it gives pending
   transactions 2 slots to land before fees change.

2. **Slot 12**: The new fees (B) activate. Any checkpoint proposed at slot >= 12 uses B
   for its sequencer/prover cost calculation.

3. **Slots 12-14**: No new oracle update is accepted. The system is in a **cooldown**
   period of `LIFETIME - LAG = 3` slots after the transition.

4. **Slot 15**: A new oracle update can be queued (earliest `acceptableSlot`). If
   triggered, the new values would activate at slot 15 + LAG = 17.

## Serving Fee Quotes: the Fee Snapshot

The `getCurrentMinFees` and `getPredictedMinFees` node RPCs (consumed by wallets and by the p2p mempool
admission/eviction policy) are served from an in-memory **fee snapshot** maintained by `FeeSnapshotService`
(`sequencer-client/src/global_variable_builder`), so a warm call issues zero L1 requests. A background loop
refreshes the snapshot once per L1 block — and proactively as the wall clock drifts toward the top of the
covered window, so empty-Ethereum-slot runs do not freeze quotes — pinning every read to the archiver's
synced L1 block number, labelling it with that block's hash, and re-validating the archiver identity before
publishing via an atomic pointer swap. Each candidate slot stores a *complete* precomputed quote: the
Solidity `getManaMinFeeAt` current fee plus a full `FEE_ORACLE_LAG`-length prediction array per
`ManaUsageEstimate`. Reads merge only complete arrays (element-wise max), never synthesizing a mixed oracle
tuple.

### The two anchor rules

A quote applies to a future slot, and the two RPCs floor that slot differently (preserving the
pre-snapshot behaviour):

- **current fee** floors on the raw pending checkpoint slot:
  `wantedCurrent(t) = max(pendingCheckpointSlot + 1, slotAtNextL1Block(t))`;
- **prediction** floors on the slot of the pinned L1 block and the prune-aware effective parent:
  `wantedPrediction(t) = max(pinnedSlot, slotAtNextL1Block(t))`.

These floors come only from snapshot-level fields (`pendingCheckpointSlot`, `pinnedSlot`); there is no
per-candidate selection state. The checkpoint-slot invariant `pendingCheckpointSlot <= pinnedSlot` (a
proposed checkpoint's slot equals the slot of its L1 inclusion timestamp) lets the refresh build a
conservative window before it has read the checkpoints, then validate exact coverage afterwards.

### Drift window

To tolerate clock skew between the node and L1, a read enumerates every distinct Aztec slot in
`[wanted(now - drift), wanted(now + drift)]` (small default, e.g. 2s; `0` disables the window and reduces
selection to the single legacy anchor) and takes the element-wise max of the complete candidate arrays. A
coverage miss — a wanted slot outside the materialized window, above or below, symmetrically — never
substitutes another slot's answer: it awaits a keyed single-flight refresh and, on timeout, fails closed
with a typed error. Concurrent reads and the poll loop share one refresh per identity/window.

### Staleness bounds

Three independent checks each fail closed with their own typed error and metric, and each is disabled by
setting its config to `0`:

- **computation age** (`now - refreshedAtMs`, reset by every successful refresh including coverage-only) —
  exceeding it means refresh is broken;
- **L1-head age** (`now - pinnedBlockTimestamp`, never reset by coverage-only refreshes) — exceeding it
  means the provider or archiver is frozen;
- **future-dated head** (`pinnedBlockTimestamp - now`) — fails closed in production; test environments that
  warp L1 time align their clock or set the allowance to `0`.

### Consistency stance

Reads are block-number pinned, hash-labelled, archiver-rechecked, and wave-consistency-checked: the refresh
re-reads `getTips` in its second multicall wave and discards the refresh if the tips differ from the first
wave (catching fork-mixing across the fallback transport). This is strictly better on state consistency than
the pre-snapshot current-fee path, which ran entirely unpinned at `latest`; on identity freshness the RPC-side
archiver identity check gives parity with the old per-call latest-block check, bounded by archiver sync
health. Residual risks, stated plainly:

- each multicall wave is atomic only on whichever fallback-transport backend served it. Without the tips
  check tripping, the two waves could still mix backends/forks whose tips coincide but whose oracle or
  governance state differs — producing an **impossible combined state**, not merely a snapshot coloured by
  one fork. The tips check narrows this; it does not eliminate it.
- in the parallel-individual-call fallback (no Multicall3 deployed), even a single logical wave can mix
  backends — a deliberately weaker guarantee than in multicall mode.
- a same-height reorg not yet observed by the archiver persists for at most one archiver poll + refresh cycle.

EIP-1898 hash pinning or explicit backend binding is the only complete fix and remains a contained follow-up
inside the refresh function; it is not part of the current design.

## Fee Asset Price

Fees are computed in ETH (wei) internally and converted to the fee asset (Fee Juice) via
`ethPerFeeAsset` (1e12 precision), rounding up (`PriceLib.toFeeAsset` in
`l1-contracts/src/core/libraries/compressed-data/fees/FeeConfig.sol`).

Each checkpoint proposal carries a fee-asset price modifier (`OracleInput`) chosen by the
proposer, bounded to ±1% (±100 bps) per checkpoint:

```
newPrice = currentPrice * (10000 + modifierBps) / 10000
```

The result is clamped to [`MIN_ETH_PER_FEE_ASSET` = 100, `MAX_ETH_PER_FEE_ASSET` = 1e14],
i.e. 1e-10 to 100 ETH per fee asset. The floor of 100 guarantees a ±1% step always moves
the integer price by at least 1.

## Transaction Fees

The checkpoint's `gasFees` (the L1-computed min fee per mana, with DA priced at zero) act
as a base fee. Senders declare `GasSettings`: gas limits, teardown gas limits,
`maxFeesPerGas`, and `maxPriorityFeesPerGas`. A tx is only includable if `maxFeesPerGas`
covers the checkpoint's `gasFees` in both dimensions. The effective fee adds an
EIP-1559-style priority fee on top of the base, capped by the max
(`computeEffectiveGasFees` in `stdlib/src/fees/transaction_fee.ts`):

```
effectiveFeePerGas = gasFees + min(maxPriorityFeePerGas, maxFeesPerGas - gasFees)   (per dimension)
transactionFee     = billedGas.daGas * effectiveFeePerDaGas + billedGas.l2Gas * effectiveFeePerL2Gas
```

`billedGas` is actual consumption except for the teardown phase, which is billed at the
declared `teardownGasLimits` rather than actual usage — the fee is charged during teardown
itself, before actual teardown consumption is known.

## Maximum Fee Change Rate

| Component              | Bound                                                    |
| ---------------------- | -------------------------------------------------------- |
| L1 base fee / blob fee | At most once every 5 slots (oracle LIFETIME)             |
| Fee asset price        | ±1% per checkpoint                                       |
| Proving cost per mana  | At most ×1.5 (or ÷1.5) per update, one update per 30 days |
| Congestion multiplier  | Depends on excess mana accumulation/drain per checkpoint |
| Sequencer/prover costs | Scale linearly with L1 fees                              |

## Key Constants

| Constant                        | Value          |
| ------------------------------- | -------------- |
| `L1_GAS_PER_CHECKPOINT_PROPOSED` | 300,000       |
| `L1_GAS_PER_EPOCH_VERIFIED`     | 3,600,000      |
| `BLOBS_PER_CHECKPOINT` (FeeLib) | 3              |
| `BLOB_GAS_PER_BLOB`             | 2^17           |
| `MINIMUM_CONGESTION_MULTIPLIER` | 1e9            |
| `LAG`                           | 2 slots        |
| `LIFETIME`                      | 5 slots        |
| `MIN_ETH_PER_FEE_ASSET`         | 100 (1e-10 ETH) |
| `MAX_ETH_PER_FEE_ASSET`         | 1e14 (100 ETH) |

⚠️ Name clash: `FeeLib.sol` (and its port `fee_math.ts`) defines `BLOBS_PER_CHECKPOINT = 3`,
used only to price the sequencer's blob costs. The protocol constant of the same name in
`@aztec/constants` is **6** — the actual blob capacity of a checkpoint, used throughout the
limits section below. The FeeLib value is a holdover from the pre-checkpoint
`BLOBS_PER_BLOCK`, so the fee model prices half of a full checkpoint's blobs.

## Gas and Data Limits

The fee model above is *how much you pay* per unit of gas; this section is *how much you may use*. Limits
form a hierarchy from a single transaction up to a whole checkpoint, and a tx that is admissible for relay
must also be buildable into a block and fit a valid checkpoint.

### Per-tx protocol maxima

Hard ceilings on what any single tx may declare, independent of network configuration. Declaring more is
rejected everywhere a tx is validated.

- **`MAX_TX_DA_GAS`** (271,200) — `MAX_TX_BLOB_DATA_SIZE_IN_FIELDS` (8,475) × `DA_GAS_PER_FIELD` (32). This
  is the most DA a single tx's effects can encode into a blob, so it is the most DA gas a tx could ever use.
  Defined in `constants/src/constants.ts`.
- **`MAX_PROCESSABLE_L2_GAS`** (6,540,000) — the AVM's maximum processable L2 gas, derived in Noir as
  `PUBLIC_TX_L2_GAS_OVERHEAD + AVM_MAX_PROCESSABLE_L2_GAS` (`constants/src/constants.gen.ts`).

### Network admission limits

The most a single tx may *declare* and still be relayed across the network. Computed by
`computeNetworkTxGasLimits` in `tx_gas_limits.ts` per dimension as:

```
min(per-tx max, ceil(checkpointBudget / blocksPerCheckpoint * minMultiplier))
```

The per-block share mirrors what a proposer grants the first block of a checkpoint
(`CheckpointBuilder.capLimitsByCheckpointBudgets`), so a tx declaring this much is packable into a block.
The network-minimum multipliers are `MIN_PER_BLOCK_ALLOCATION_MULTIPLIER` (1.2, L2 and tx count) and
`MIN_PER_BLOCK_DA_ALLOCATION_MULTIPLIER` (1.5, DA). DA's is higher so a maximal contract class
registration (~97k DA gas) fits a single block at mainnet geometry (72s slots, 6s blocks → 10 blocks per
checkpoint).

The DA budget is `getDaCheckpointBudgetForTxs(maxBlocksPerCheckpoint)`, not the raw
`MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT` (786,432). Blob encoding spends overhead fields that no tx pays DA
gas for — one checkpoint-end marker field and the per-block block-end fields (7 for the first block, 6 for
each subsequent block, `blob-lib/src/encoding/block_blob_data.ts`) — so the raw constant is unattainable. The
getter nets out the full overhead for a checkpoint of `maxBlocksPerCheckpoint` blocks: at mainnet geometry
(10 blocks) that is `(24,576 − 1 − 7 − 9×6) × 32 = 24,514 × 32 = 784,448` DA gas. Subtracting every block's
overhead (not just the first) keeps admission at or below the builder's first-block blob-field cap at every
geometry — the builder is the most generous for the first block (it only reserves that block's own block-end
overhead), so being conservative here is what guarantees admitted ⇒ buildable. Without this netting a tx
near the raw limit would be admitted but never buildable.

These limits depend on network-wide inputs only (timetable-derived blocks-per-checkpoint, checkpoint
budgets, the network-minimum multipliers), never on a node's local restrictiveness. Every node always
advertises them in `NodeInfo.txsLimits` (a required field); wallets read it and pass `txsLimits.gas` to
`GasSettings.fallback` as the default gas limits when sending without explicit limits, and they are enforced
by `GasLimitsValidator` (clamped to the per-tx protocol maxima) at three points: RPC tx acceptance
(`aztec-node/src/aztec-node/server.ts`), gossip validation (`p2p/src/services/libp2p/libp2p_service.ts`),
and pending-pool admission (`p2p/src/client/factory.ts`). They are deliberately *not* enforced at req/resp or
block-proposal validation — admission is relay policy, not block validity.

### Per-block builder budgets

While packing a checkpoint, `CheckpointBuilder.capLimitsByCheckpointBudgets`
(`validator-client/src/checkpoint_builder.ts`) computes each block's budget as a fair share of the remaining
checkpoint budget across the remaining blocks, scaled by the configured multipliers. Operators may raise the
multipliers above the network minimums but not lower them — the sequencer fails startup otherwise
(`assertConfigMeetsNetworkTxLimits` in `sequencer-client/src/sequencer/sequencer.ts`), since a node that
allocates less than it admits would accept txs over RPC/gossip that its builder can never pack.

The fair share is then min'ed with the operator's absolute per-block caps `maxL2BlockGas` / `maxDABlockGas`
and the blob-field cap (checkpoint capacity net of the checkpoint-end marker and this block's block-end
overhead). The absolute caps are allowed to be restrictive: a cap below the network admission limit only
produces a startup warning, not a failure, because such txs simply stay in the pool for other proposers to
include.

### Per-checkpoint budgets

The outermost limits, enforced as proposal validity in `validateCheckpointLimits`
(`stdlib/src/checkpoint/validate.ts`) and physically by blob encoding:

- **Mana** — total L2 gas across all blocks ≤ `rollupManaLimit` (= `manaTarget × 2` on L1,
  `l1-contracts/src/core/libraries/rollup/FeeLib.sol`).
- **DA gas** — total DA gas ≤ raw `MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT` (786,432).
- **Blob fields** — total ≤ `BLOBS_PER_CHECKPOINT × FIELDS_PER_BLOB` (6 × 4,096 = 24,576).
- **Tx counts** — total txs ≤ `maxTxsPerCheckpoint` when configured.

### Summary

| Limit                                   | Value (mainnet defaults)        | Scope         | Where enforced                                              |
| --------------------------------------- | ------------------------------- | ------------- | ----------------------------------------------------------- |
| `MAX_TX_DA_GAS`                         | 271,200                         | per-tx        | every gas validator (hard ceiling)                          |
| `MAX_PROCESSABLE_L2_GAS`                | 6,540,000                       | per-tx        | every gas validator (hard ceiling)                          |
| Network DA admission limit              | min(271,200, ceil(784,448/10×1.5)) = 117,668 | per-tx (relay) | RPC, gossip, pending pool (`GasLimitsValidator`)         |
| Network L2 admission limit              | min(6,540,000, ceil(manaLimit/10×1.2)) | per-tx (relay) | RPC, gossip, pending pool (`GasLimitsValidator`)         |
| Per-block fair share + caps             | remaining budget / blocks × multiplier, min absolute caps & blob-field cap | per-block | `CheckpointBuilder.capLimitsByCheckpointBudgets`         |
| `rollupManaLimit`                       | `manaTarget × 2`                | per-checkpoint | `validateCheckpointLimits`                                |
| `MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT` | 786,432                         | per-checkpoint | `validateCheckpointLimits` + blob encoding                |
| `BLOBS_PER_CHECKPOINT × FIELDS_PER_BLOB`| 24,576                          | per-checkpoint | `validateCheckpointLimits` + blob encoding                |

## TypeScript Types

- **`Gas`** — gas quantity in two dimensions (`daGas`, `l2Gas`).
- **`GasFees`** — per-unit price in each dimension (`feePerDaGas`, `feePerL2Gas`).
- **`GasSettings`** — sender-chosen fee parameters: gas limits, teardown limits, max fees, priority fees.
- **`GasUsed`** — actual consumption after execution. Note: `billedGas` uses the teardown gas *limit*, not actual usage.
- **`fee_math.ts`** — TypeScript port of the FeeLib formulas, used for fee prediction over the oracle LAG window.
