# Chapter 3: Transaction Lifecycle

## Overview

This chapter traces a transaction from user initiation to L1 settlement, explaining what happens at each step.

## Step 1: User Initiates Transaction

A user wants to perform an action, such as transferring tokens privately. They interact with their wallet, which constructs a **Transaction Request**:

```
Transaction Request
+----------------------------------+
| origin: Account contract address |
| functionData: Function selector  |
| argsHash: Hash of arguments      |
| txContext: Chain ID, gas settings|
+----------------------------------+
```

The wallet passes this to the PXE for execution.

## Step 2: Private Execution in PXE

The PXE executes the requested private function locally:

```
PXE Execution Flow
+--------------------------------------------------+
| 1. Load user's private keys and notes            |
| 2. Execute the private function                  |
| 3. Collect side effects:                         |
|    - New note hashes (created notes)             |
|    - Nullifiers (consumed notes)                 |
|    - Encrypted logs                              |
|    - L2-to-L1 messages                           |
|    - Public call requests (if any)               |
| 4. If function calls other private functions,    |
|    add them to the private call stack            |
+--------------------------------------------------+
```

### The Private Call Stack

Private functions can call other private functions. The PXE maintains a **call stack**:

```
Initial:  [main_function]
After call: [main_function, helper_function]
After return: [main_function]
```

Each function in the stack produces an **app circuit proof** - a proof that the function executed correctly given its inputs.

## Step 3: Private Kernel Circuit Processing

After each private function executes, the **Private Kernel Circuit** processes the results:

```
Private Kernel Processing
+-----------------------------------------------+
| For each private function call:               |
|                                               |
| 1. Verify the app circuit proof               |
| 2. Validate call context (caller, arguments)  |
| 3. Scope side effects with contract address   |
| 4. Accumulate side effects into output arrays |
| 5. Update the private call stack              |
|                                               |
| Kernel variants:                              |
| - Init: First call in transaction             |
| - Inner: Subsequent calls                     |
| - Reset: Squash transient data, validate      |
| - Tail/TailToPublic: Finalize for rollup      |
+-----------------------------------------------+
```

The kernel circuits run iteratively:

```
[Init] -> [Inner] -> [Inner] -> ... -> [Reset] -> [Tail]
   |         |          |                 |          |
  1st       2nd        3rd            Optimize   Finalize
```

## Step 4: Hiding Kernel (Bridge)

Before the transaction leaves the user's device, a **Hiding Kernel** circuit runs:

```
Hiding Kernel
+------------------------------------------+
| Purpose: Hide private execution details  |
|                                          |
| - Hides which functions were called      |
| - Hides the number of private calls      |
| - Produces a fixed-format output         |
|                                          |
| Two variants:                            |
| - hiding-kernel-to-rollup (private-only) |
| - hiding-kernel-to-public (has public)   |
+------------------------------------------+
```

After this step, the transaction proof can be sent to the network.

## Step 5: Transaction Submitted to Network

The proven transaction is submitted to the mempool:

```
Transaction Contents
+------------------------------------------+
| - Hiding kernel proof                    |
| - Public inputs (commitments, nullifiers)|
| - Contract class logs (if deploying)     |
| - Encrypted logs                         |
| - Public call requests (if any)          |
+------------------------------------------+
```

Sequencers pick up transactions from the mempool.

## Step 6: Public Execution (If Applicable)

If the transaction includes public function calls, the sequencer's AVM executes them:

```
AVM Execution
+----------------------------------------------+
| 1. Receive public call requests from private |
| 2. Execute in three phases:                  |
|    - Setup: Non-revertible (fee payment)     |
|    - App Logic: Main logic (can revert)      |
|    - Teardown: Fee finalization              |
| 3. Access/modify public state                |
| 4. Produce AVM proof                         |
+----------------------------------------------+
```

The AVM has access to current state that the PXE couldn't see.

## Step 7: Transaction Base Rollup

The sequencer processes each transaction through a **TX Base circuit**:

```
TX Base Circuit
+----------------------------------------------+
| Validates:                                   |
| - The hiding kernel proof is valid           |
| - The anchor block exists in archive tree    |
| - Gas prices meet minimum requirements       |
| - Transaction doesn't exceed gas limits      |
|                                              |
| Computes:                                    |
| - Transaction fee                            |
| - Updated tree snapshots                     |
| - Siloed L2-to-L1 message hashes             |
|                                              |
| Produces:                                    |
| - Updated state roots                        |
| - Blob data accumulator                      |
+----------------------------------------------+
```

Two variants exist:
- **TX Base Private**: For transactions with only private execution
- **TX Base Public**: For transactions that also had AVM execution

## Step 8: Block Building

Multiple transactions are merged into a block:

```
Block Building
+--------------------------------------+
| TX Merge: Combine TX proofs in pairs |
|                                      |
|  [TX1]   [TX2]   [TX3]   [TX4]       |
|     \   /           \   /            |
|   [Merge]         [Merge]            |
|        \         /                   |
|         [Merge]                      |
|            |                         |
|      [Block Root]                    |
|                                      |
| Block Root circuit:                  |
| - Creates block header               |
| - Inserts header into archive tree   |
| - Accumulates fees and mana          |
+--------------------------------------+
```

Special circuits handle edge cases:
- First block in checkpoint (needs parity proof for L1->L2 messages)
- Single-transaction blocks
- Empty blocks

## Step 9: Checkpoint Creation

Blocks are grouped into checkpoints:

```
Checkpoint Building
+----------------------------------------+
| Block Merge: Combine block proofs      |
|                                        |
|  [Blk1]  [Blk2]  [Blk3]  [Blk4]        |
|     \     /         \     /            |
|   [Merge]         [Merge]              |
|        \         /                     |
|     [Checkpoint Root]                  |
|                                        |
| Checkpoint Root circuit:               |
| - Validates block consecutiveness      |
| - Squeezes the blob sponge             |
| - Computes KZG commitments             |
| - Creates checkpoint header            |
+----------------------------------------+
```

The checkpoint is where blob data is finalized - the Poseidon2 sponge that accumulated all transaction effects is "squeezed" to produce commitments.

## Step 10: Epoch Proof and L1 Submission

Finally, checkpoints are merged into an epoch proof:

```
Epoch Building
+--------------------------------------+
| Checkpoint Merge: Combine CP proofs  |
|                                      |
|  [CP1]  [CP2]  [CP3]  [CP4]          |
|    \     /       \     /             |
|  [Merge]       [Merge]               |
|      \         /                     |
|    [Root Rollup]                     |
|         |                            |
|   Final Epoch Proof                  |
|         |                            |
|    Submit to L1                      |
+--------------------------------------+
```

The **Root Rollup** circuit:
- Validates all checkpoint proofs
- Verifies blob batching challenges
- Produces the final public inputs for L1

## Step 11: L1 Verification

On Ethereum:

```
L1 Verification
+--------------------------------------+
| 1. Rollup contract receives:         |
|    - Epoch proof                     |
|    - Blob commitments                |
|    - State transition data           |
|                                      |
| 2. Verifier contract checks:         |
|    - Proof validity                  |
|    - Blob commitments match          |
|    - State roots are consistent      |
|                                      |
| 3. If valid:                         |
|    - Update state roots              |
|    - Transaction is final            |
+--------------------------------------+
```

## Timeline Summary

```
User Device          Network             Ethereum
-----------          -------             --------
1. Create TX
2. Execute Private
3. Kernel Circuits
4. Hiding Kernel
5. Submit ---------> 6. Mempool
                     7. AVM Execution
                     8. TX Base
                     9. Block
                     10. Checkpoint
                     11. Epoch -------> 12. Verify
                                        13. Finalize
```

The entire process, from user click to L1 finality, involves dozens of circuit proofs all aggregated into a single verifiable proof.

\newpage
