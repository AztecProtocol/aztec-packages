# Chapter 7: Public Execution and the AVM

## Overview

Public function execution in Aztec is handled by the **Aztec Virtual Machine (AVM)**. Unlike private execution (which runs on user devices), public execution runs on sequencer nodes where access to current state is required.

**Key distinction:** There is no "public kernel" circuit. The AVM executes all public functions for a transaction in a single proof.

## When Public Execution Happens

Public execution occurs when:
1. A private function enqueues a public call via `public_call_requests`
2. The transaction includes public function calls in its request

The execution flow for transactions with public calls:

```
User Device                     Sequencer Node
-----------                     --------------
1. Private Kernel (Init)
2. Private Kernel (Inner)
3. Private Kernel (Reset)
4. Private Kernel (TailToPublic)
5. Hiding Kernel (to-public)
        |
        +-------------------------> 6. Chonk Verifier
                                    7. AVM Execution
                                    8. TX Base Public
```

## The AVM's Role

The AVM processes public call requests from the private phase:

```
AVM Inputs
+------------------------------------------+
| From private phase:                      |
| - Public call requests (setup, app,      |
|   teardown)                              |
| - Non-revertible accumulated data        |
| - Revertible accumulated data            |
| - Gas settings                           |
| - Fee payer address                      |
|                                          |
| From current state:                      |
| - Public data tree                       |
| - Note hash tree                         |
| - Nullifier tree                         |
+------------------------------------------+
```

## Execution Phases

The AVM executes public functions in three distinct phases:

### Phase 1: Setup (Non-Revertible)

```
Purpose: Fee payment preparation

Characteristics:
- Cannot be reverted
- Ensures sequencer gets paid even if tx fails
- Typically handles fee escrow or approval

Example calls:
- FeeJuice.approve(sequencer, max_fee)
- Escrow.lockFees(tx_hash, amount)
```

### Phase 2: App Logic (Revertible)

```
Purpose: Main application logic

Characteristics:
- Can be reverted if execution fails
- May read/write public state
- May emit logs and messages
- Most user logic happens here

Example calls:
- Token.publicTransfer(recipient, amount)
- DEX.swap(tokenIn, tokenOut, amount)
```

### Phase 3: Teardown (Revertible)

```
Purpose: Fee finalization

Characteristics:
- Runs after app logic
- Finalizes fee payment
- Can handle refunds for unused gas
- Reverts if fee payment fails

Example calls:
- FeeJuice.payFee(sequencer, actual_fee)
- Escrow.releaseFees(tx_hash)
```

### Phase Diagram

```
+------------+     +-------------+     +------------+
|   Setup    | --> |  App Logic  | --> |  Teardown  |
+------------+     +-------------+     +------------+
| Non-revert |     | Revertible  |     | Revertible |
| Fee prep   |     | User logic  |     | Fee final  |
+------------+     +-------------+     +------------+
```

If App Logic reverts:
- Setup side effects: **Kept** (fee preparation honored)
- App Logic side effects: **Discarded**
- Teardown: Still runs (must succeed for tx to be valid)

## AVM State Access

The AVM has full access to current state:

```
State Access in AVM
+------------------------------------------+
| Read:                                    |
| - Public data tree (any slot)            |
| - Note hash tree (membership proofs)     |
| - Nullifier tree (existence checks)      |
| - L1-to-L2 message tree                  |
|                                          |
| Write:                                   |
| - Public data tree                       |
| - Note hash tree (append)                |
| - Nullifier tree (insert)                |
| - L2-to-L1 messages (emit)               |
+------------------------------------------+
```

This is fundamentally different from private execution, which can only read historical state snapshots.

## AVM Outputs

After execution, the AVM produces:

| Output | Description |
|--------|-------------|
| `note_hashes` | Combined private + public note commitments |
| `nullifiers` | Combined private + public nullifiers |
| `l2_to_l1_msgs` | Cross-chain messages to Ethereum |
| `public_logs` | Event data from public execution |
| `public_data_writes` | State updates to public data tree |
| `end_tree_snapshots` | Final state of all trees |
| `transaction_fee` | Computed fee based on gas consumed |
| `reverted` | Whether app logic phase reverted |

## Tree Snapshots

The AVM tracks tree state before and after execution:

```
Start Snapshots (input):
+------------------------------------------+
| note_hash_tree: { root: R1, size: 1000 } |
| nullifier_tree: { root: R2, size: 500 }  |
| public_data_tree: { root: R3 }           |
+------------------------------------------+

End Snapshots (output):
+------------------------------------------+
| note_hash_tree: { root: R1', size: 1010 }|
| nullifier_tree: { root: R2', size: 505 } |
| public_data_tree: { root: R3' }          |
+------------------------------------------+
```

These snapshots are validated in rollup circuits to ensure continuity across transactions.

## Gas Metering

The AVM meters gas similar to the EVM:

```
Gas Types
+------------------------------------------+
| L2 Gas: Computation cost                 |
| DA Gas: Data availability cost           |
+------------------------------------------+

Gas Flow:
1. User sets gas limits in tx_context
2. Setup phase uses some gas
3. App logic uses remaining gas
4. Teardown has its own gas allocation
5. Fee = gas_used * gas_price
```

Gas ensures:
- Sequencers are compensated for computation
- DOS attacks are economically infeasible
- Users pay fair prices for resources

## Handling Reverts

When app logic reverts:

```
Before Revert:
  non_revertible: [N1, N2]      (from setup)
  revertible: [A, B, C]         (from app logic)

After Revert:
  final_data: [N1, N2]          (only non-revertible kept)
  revert_code: 1                (indicates revert)
```

The transaction is still valid - the sequencer is paid, and setup effects are preserved.

## Private vs Public Comparison

| Aspect | Private (PXE) | Public (AVM) |
|--------|---------------|--------------|
| **Location** | User device | Sequencer node |
| **State Access** | Historical snapshot | Current state |
| **Privacy** | Inputs hidden | Inputs visible |
| **Proof Type** | Kernel circuits | AVM circuit |
| **Iterations** | Per-function | All functions at once |
| **Gas** | Pre-paid | Metered during execution |

## AVM Circuit

The AVM produces a single proof covering all public execution:

```
AVM Proof Contents
+------------------------------------------+
| - Execution trace for all public calls   |
| - Memory operations                       |
| - State read/write proofs                 |
| - Gas accounting                          |
| - Final accumulated data                  |
+------------------------------------------+
```

This proof is verified in the `tx-base-public` rollup circuit alongside the `chonk-verifier-public` proof (which verified the private portion).

\newpage
