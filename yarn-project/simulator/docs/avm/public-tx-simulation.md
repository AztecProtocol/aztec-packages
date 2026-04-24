# Public Transaction Simulation

This document describes the lifecycle of a transaction's public execution beyond what happens inside individual enqueued public calls. It covers insertions of side-effects from private, execution phases, revert handling and state rollback, fee payment, and the tree padding steps required before a transaction can be proven.

## Overview

A transaction in Aztec may include both private and public execution. Private execution happens client-side and produces a set of side effects (nullifiers, note hashes, messages) along with enqueued public call requests. These public calls are then executed by the sequencer.

Public transaction simulation encompasses:

1. **Execution phases** - Organizing public calls into setup, app logic, and teardown
2. **Side effect integration** - Committing side effects from private execution into world state
3. **State management** - Handling reverts with proper rollback semantics
4. **Fee payment** - Deducting the transaction fee from the fee payer
5. **Tree padding**

## Execution Phases

Public execution is divided into three phases, each with different revert semantics:

### SETUP Phase (Non-Revertible)

The setup phase contains critical operations that **must succeed** for the transaction to be valid. These are typically protocol-level operations or prerequisite checks.

- If any call in setup reverts, the **entire transaction is discarded**
- No state changes from the transaction are preserved
- The transaction never appears on-chain
- Even teardown does not execute
- **Fee**: No fee is charged. The fee payer's balance is not touched because the transaction never lands

### APP_LOGIC Phase (Revertible)

The app logic phase contains the main application functionality. This is where most user-initiated public calls execute.

- If app logic reverts, the transaction **still succeeds** (with a revert code)
- State changes from app logic are rolled back
- Side effects from private's revertible portion are also discarded
- Teardown still executes
- The transaction appears on-chain with `APP_LOGIC_REVERTED` status
- **Fee**: The fee payer is charged the full transaction fee, including the entire reserved teardown gas limit (see [Billed Gas vs Actual Gas](#billed-gas-vs-actual-gas))

### TEARDOWN Phase (Revertible, Always Runs)

The teardown phase always executes, even if app logic reverted.

- Has its own separate gas allocation
- Only phase that can access the actual transaction fee
- If teardown reverts, its state changes are rolled back
- **Fee**: The fee payer is charged the full transaction fee **regardless of whether teardown succeeded or reverted**. The top-level fee deduction happens after (and outside of) the teardown call's rollback scope, so a teardown revert only undoes teardown's own state changes (e.g. refund logic). The fee payer has already been billed for the teardown gas limit, not teardown's actual consumption

> **FPC authors, take note.** Teardown is a best-effort refund/settlement mechanism, not a gate. If your FPC relies on an assertion in teardown (e.g. "did the user stay under their fee allowance?"), the revert rolls back the FPC's bookkeeping but **does not reverse the fee payment** — the FPC is the fee payer, so it still pays for the entire transaction. Enforcement that must be binding should live in private, where a failed assertion makes the transaction unprovable.

### Phase Execution Order

```
TX execution begins
       │
       ▼
┌──────────────────┐
│  Insert private  │ ◄─── Non-revertible side effects from private
│  side effects    │      (nullifiers, note hashes, L2→L1 msgs)
└────────┬─────────┘      Revert here = TX discarded entirely
         │
         ▼
┌──────────────────┐
│   SETUP Phase    │ ──── Revert here = TX discarded entirely
└────────┬─────────┘
         │
         ▼
  ═══ CHECKPOINT ═══ ◄─── Point we can roll back to
         │
         ▼
┌──────────────────┐
│  Insert private  │ ◄─── Revertible side effects from private
│  side effects    │      (nullifiers, note hashes, L2→L1 msgs)
└────────┬─────────┘      Revert here = rollback to checkpoint
         │
         ▼
┌──────────────────┐
│  APP_LOGIC Phase │ ──── Revert here = rollback to checkpoint
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  TEARDOWN Phase  │ ──── Revert here = rollback to checkpoint
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   Fee Payment    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   Tree padding   │
└──────────────────┘
```

## Revert Handling and State Rollback

Aztec implements a checkpoint-based rollback mechanism that allows graceful handling of reverts in revertible phases while preserving the results of non-revertible work.

### The Post-Setup Checkpoint

After the setup phase completes successfully, a **checkpoint** is created. This checkpoint captures:

- The state of all merkle trees (nullifier, note hash, public data)
- Pending storage writes
- Pending nullifiers
- All accumulated side effects

This checkpoint is the "safe point" that revertible phases can roll back to.

### Rollback Triggers

Rollback to the post-setup checkpoint occurs when:

1. **Revertible private insertions fail** - A nullifier from private's revertible portion collides with an existing nullifier, or a limit is exceeded
2. **App logic reverts** - Any enqueued call in the app logic phase reverts
3. **Teardown reverts** - The teardown call reverts

### What Gets Rolled Back

When a revertible phase reverts:

| Rolled Back | Preserved |
|-------------|-----------|
| Storage writes from the phase | Setup phase state changes |
| Nullifiers from the phase | Non-revertible private side effects |
| Note hashes from the phase | Gas consumption tracking |
| L2→L1 messages from the phase | Execution logs (for debugging) |
| Public logs from the phase | The fact that a revert occurred |

### Summary: Failure Consequences by Phase

This table unifies what happens to the transaction, the fee, and each category of side effect depending on where the failure occurs. **"Full fee"** always means `billedGas = privateGas + setupGas + appLogicGas + teardownGasLimit` — teardown is billed for its limit, not its actual consumption (see [Billed Gas vs Actual Gas](#billed-gas-vs-actual-gas)).

| Failure point | On-chain? | Fee charged | Non-revertible private side effects | Revertible private side effects | Setup state | App logic state | Teardown state |
|---|---|---|---|---|---|---|---|
| Non-revertible private insertion fails (e.g. nullifier collision) | No | None | Discarded | Discarded | — | — | — |
| SETUP reverts | No | None | Discarded | Discarded | Discarded | — | — |
| Revertible private nullifier collision | No | None | Discarded | Discarded | Discarded | — | — |
| Revertible side-effect limit exceeded (e.g. max nullifiers) | Yes | Full fee | Preserved | Discarded | Preserved | Skipped | Runs |
| APP_LOGIC reverts | Yes | Full fee | Preserved | Discarded | Preserved | Discarded | Runs |
| TEARDOWN reverts | Yes | Full fee | Preserved | Discarded | Preserved | Discarded | Discarded |
| All phases succeed | Yes | Full fee | Preserved | Preserved | Preserved | Preserved | Preserved |

Two facts that surprise people:

1. **Any revert after the post-setup checkpoint costs the full fee.** The transaction lands on-chain and the fee payer is billed for all of private + setup + app logic + the full teardown gas limit — even if app logic or teardown reverted and rolled back their writes.
2. **A teardown revert does not reverse the fee payment.** Teardown's rollback scope covers its own public data writes (including any refund it tried to record). The top-level fee deduction from the fee payer's Fee Juice balance happens outside that scope.

## Private Side Effect Integration

Before public execution begins, side effects from private execution must be integrated into world state.

### Non-Revertible Side Effects

Inserted **before** the setup phase:

- **Nullifiers** from private's non-revertible portion (including deployed contracts)
- **Note hashes** from private's non-revertible portion
- **L2→L1 messages** from private's non-revertible portion

If any insertion fails (e.g., nullifier already exists), the transaction is discarded entirely.

### Revertible Side Effects

Inserted **after** the post-setup checkpoint:

- **Nullifiers** from private's revertible portion (including deployed contracts)
- **Note hashes** from private's revertible portion
- **L2→L1 messages** from private's revertible portion

If the side-effect limit is reached (e.g., max nullifiers per tx exceeded), state rolls back to the post-setup checkpoint, and execution proceeds immediately to the TEARDOWN phase.

A **nullifier collision** during revertible insertion results in the transaction being discarded entirely. Nullifier collisions from privately emitted nullifiers are disallowed regardless of the phase.

## Gas Allocation and Metering

Gas is tracked in two dimensions: **L2 gas** (computation) and **DA gas** (data availability). The transaction sender specifies gas limits that constrain execution.

### Gas Limit Structure

```
┌─────────────────────────────────────────────────────────────┐
│                   Transaction Gas Limits                    │
├───────────────────────────────────────┬─────────────────────┤
│            gasLimits                  │  teardownGasLimits  │
│  (private + setup + app logic)        │   (teardown only)   │
└───────────────────────────────────────┴─────────────────────┘
```

The teardown phase has a **separate gas allocation** that doesn't compete with other phases. This ensures teardown can always execute even if app logic exhausts its gas budget.

### Gas Accounting During Private Execution

When private execution completes, the reported "gas used by private" includes:

- Actual gas consumed during private execution
- The **entire teardown gas limit** (reserved, not yet consumed)

This reservation ensures that the gas available for public setup and app logic is: `gasLimits - gasUsedByPrivate`, which already accounts for teardown's reserved budget.

### Gas Allocation Per Enqueued Call

Each enqueued call within a phase is allocated **all remaining gas** for that phase. After the call completes, actual consumption is deducted:

- First call in setup: gets `gasLimits - gasUsedByPrivate`
- Second call in setup: gets remaining after first call
- Teardown call: gets `teardownGasLimits`

### Billed Gas vs Actual Gas

The protocol distinguishes between:

| Metric | Description |
|--------|-------------|
| **Billed gas** | Used for fee calculation. Includes teardown gas **limit** (not actual). |
| **Actual gas** | Real consumption. Replaces teardown limit with actual teardown usage. |

This distinction exists because teardown needs to know the transaction fee before it executes. If fees depended on teardown's actual consumption, there would be a circular dependency. By using the teardown gas limit for billing, the fee is deterministic before teardown runs.

A consequence: **teardown is always billed for its full limit, even if teardown consumes less — or reverts entirely**. A teardown revert does not reduce the fee.

## Fee Payment

Every transaction must pay a fee based on gas consumption.

### Effective Gas Fees

The transaction fee is computed using **effective gas fees**, which combine:

- **Base gas fees** - Set by the protocol based on network conditions
- **Priority fees** - Optional tip from the sender to incentivize inclusion

The effective fee per gas unit is: `min(baseFee + priorityFee, maxFeePerGas)`

### Fee Calculation

The transaction fee is: `billedGas.l2Gas × effectiveFeePerL2Gas + billedGas.daGas × effectiveFeePerDaGas`

Where billed gas = private gas + setup gas + app logic gas + **teardown gas limit**.

### Fee Visibility During Execution

| Phase | Can Access Transaction Fee? |
|-------|---------------------------|
| SETUP | No (sees zero) |
| APP_LOGIC | No (sees zero) |
| TEARDOWN | Yes (sees computed fee) |

This design allows teardown to perform fee-related operations like refunds while preventing earlier phases from gaming fee calculations. Since the fee uses the teardown gas limit (not actual), the fee value seen during teardown is the final fee.

### Fee Payment Mechanism

After all phases complete:

1. The transaction fee is computed from billed gas and effective fees
2. The fee is deducted from the fee payer's Fee Juice balance
3. This deduction is recorded as a public data write

This deduction is **outside the teardown rollback scope**. If teardown reverts, its own public data writes (including any refund it recorded) are discarded, but the fee-payer deduction above still lands. In other words, the fee is charged for any transaction that makes it past setup — whether app logic and teardown succeeded or not.

If the fee payer has insufficient balance:
- During simulation for fee estimation: can be skipped
- During simulation for block building or proving: transaction fails

## Tree Padding

Before a transaction can be proven, merkle trees must be padded to fixed increment sizes.

### Why Padding Is Needed

Padding inserts empty values into the trees to keep them aligned to fixed increments per transaction.

### What Gets Padded

| Tree | Padding Value |
|------|---------------|
| Note hash tree | Zero |
| Nullifier tree | Empty nullifier leaf |
| Public data tree | Empty public data leaf |

## Transaction Outputs

After simulation completes, the following outputs are produced:

- **Start tree snapshots** - Merkle tree roots before public execution
- **End tree snapshots** - Merkle tree roots after public execution and padding
- **Accumulated data** - All side effects with counters (note hashes, nullifiers, messages, public data writes, public logs)

## Execution Context Isolation

Each enqueued call executes with its own context, but within the shared transaction context:

- **Isolated**: Each call has its own memory, calldata, and return data
- **Shared**: All calls in a phase share the same world state view
- **Ordered**: Calls execute sequentially within their phase
- **Bounded**: Each call's gas consumption is tracked and limited

---
← Previous: [Enqueued Calls](./enqueued-calls.md) | Next: [State](./state.md) →
