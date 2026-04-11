# Aztec Gas and Fee Model

The minimum fee per mana and its components are computed on L1 in
`l1-contracts/src/core/libraries/rollup/FeeLib.sol`. This document describes the
formulas, the oracle lag/lifetime mechanism, and the TypeScript types in this directory.

## Mana

Aztec uses **mana** as its unit of work (analogous to Ethereum gas). Transactions consume
mana in two dimensions: **DA** (data availability) and **L2** (execution). The total fee
is `gasUsed * feePerMana` summed across both dimensions.

## Fee Components

The minimum fee per mana has four components:

### Sequencer Cost

L1 cost to propose a checkpoint (calldata gas + blob data), amortized over `manaTarget`:

```
sequencerCost = ((L1_GAS_PER_CHECKPOINT_PROPOSED * baseFee)
              + (BLOBS_PER_CHECKPOINT * BLOB_GAS_PER_BLOB * blobFee))
              / manaTarget
```

### Prover Cost

L1 cost to verify an epoch proof, amortized over epoch duration and `manaTarget`, plus a
governance-set proving cost that compensates for off-chain proof generation:

```
proverCost = (L1_GAS_PER_EPOCH_VERIFIED * baseFee / epochDuration) / manaTarget
           + provingCostPerMana
```

### Congestion Cost

An exponential surcharge when the network is congested (inspired by EIP-1559; the
implementation uses the `fakeExponential` Taylor series approximation from EIP-4844):

```
baseCost          = sequencerCost + proverCost
congestionCost    = baseCost * congestionMultiplier / MINIMUM_CONGESTION_MULTIPLIER - baseCost
```

When there is no congestion the multiplier equals `MINIMUM_CONGESTION_MULTIPLIER` (1e9)
and congestion cost is zero.

### Congestion Multiplier

```
excessMana          = max(0, prevExcessMana + prevManaUsed - manaTarget)
congestionMultiplier = fakeExponential(MINIMUM_CONGESTION_MULTIPLIER, excessMana, denominator)
```

Each additional `manaTarget` of excess mana increases the multiplier by ~12.5%.

### Total

```
minFeePerMana = sequencerCost + proverCost + congestionCost
```

## L1 Gas Oracle: Lag and Lifetime

The oracle feeds Ethereum's `baseFee` and `blobFee` into the fee model using a two-phase
(`pre` / `post`) system that smooths out L1 fee volatility.

- **LAG = 2 slots** — when new L1 fees are observed, they activate `LAG` slots later
  (`slotOfChange = currentSlot + LAG`). This gives mempool transactions time to land
  before fees change.
- **LIFETIME = 5 slots** — after an oracle update, the next update is rejected until
  `slotOfChange + (LIFETIME - LAG)` = 3 more slots have passed. This rate-limits how
  frequently L1 fee data can change.

Fee resolution at a given timestamp:

```
if slot < slotOfChange  →  use pre  (old fees)
else                    →  use post (new fees)
```

**Net effect**: L1 fee changes reach L2 with a 2-slot delay and can update at most once
every 5 slots.

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

## Fee Asset Price

Fees are computed in ETH internally but converted to the fee asset (Fee Juice) via
`ethPerFeeAsset` (1e12 precision). The price updates at most ±1% (±100 bps) per
checkpoint:

```
newPrice = currentPrice * (10000 + modifierBps) / 10000
```

## Maximum Fee Change Rate

| Component              | Bound                                                   |
| ---------------------- | ------------------------------------------------------- |
| L1 base fee / blob fee | At most once every 5 slots (oracle LIFETIME)            |
| Fee asset price        | ±1% per checkpoint                                      |
| Congestion multiplier  | Depends on excess mana accumulation/drain per checkpoint |
| Sequencer/prover costs | Scale linearly with L1 fees                             |

## Key Constants

| Constant                       | Value          |
| ------------------------------ | -------------- |
| `L1_GAS_PER_CHECKPOINT_PROPOSED` | 300,000      |
| `L1_GAS_PER_EPOCH_VERIFIED`     | 3,600,000    |
| `BLOBS_PER_CHECKPOINT`          | 3            |
| `BLOB_GAS_PER_BLOB`             | 2^17         |
| `MINIMUM_CONGESTION_MULTIPLIER` | 1e9          |
| `LAG`                           | 2 slots      |
| `LIFETIME`                      | 5 slots      |

## TypeScript Types

- **`Gas`** — mana quantity in two dimensions (`daGas`, `l2Gas`).
- **`GasFees`** — per-unit price in each dimension (`feePerDaGas`, `feePerL2Gas`).
- **`GasSettings`** — sender-chosen fee parameters: gas limits, teardown limits, max fees, priority fees.
- **`GasUsed`** — actual consumption after execution. Note: `billedGas` uses the teardown gas *limit*, not actual usage.
