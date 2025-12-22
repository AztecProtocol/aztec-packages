---
title: Public Execution (AVM)
sidebar_position: 1
tags: [protocol, circuits]
description: Learn how the Aztec Virtual Machine (AVM) executes public functions and manages public state transitions.
---

Public function execution in Aztec is handled by the **Aztec Virtual Machine (AVM)**. Unlike private execution (which runs on user devices), public execution runs on the sequencer's infrastructure where access to current state is required.

:::note
Unlike the private kernel which runs recursively for each private call, **there is no "public kernel" circuit**. The AVM executes all public functions for a transaction in a single proof. The term "public kernel" is sometimes used colloquially to refer to the AVM's role in public execution.
:::

## Overview

The AVM processes public call requests that were queued during private execution. It operates on the current state of the public data tree, note hash tree, and nullifier tree—state that only the sequencer knows at execution time.

For transactions containing public functions, the execution flow is:

1. **Private Kernel** - Processes private functions, queues public call requests
2. **Hiding Kernel** - Bridges private output to public phase
3. **AVM** - Executes all public functions, produces accumulated data
4. **Rollup Circuits** - Validates proofs and includes in block

## Execution Phases

The AVM executes public functions in three distinct phases:

| Phase         | Revertible | Purpose                                         |
| ------------- | ---------- | ----------------------------------------------- |
| **Setup**     | No         | Non-revertible initialization (fee preparation) |
| **App Logic** | Yes        | Main application logic                          |
| **Teardown**  | Yes        | Fee payment finalization                        |

This phased approach enables atomic fee payment even if the main transaction logic reverts. The setup phase cannot be reverted, ensuring the sequencer receives payment.

## Inputs and Outputs

### Inputs from Private Execution

The AVM receives from the private phase:

- **Public call requests**: Setup, app logic, and teardown function calls
- **Non-revertible accumulated data**: Note hashes, nullifiers, L2-L1 messages from setup phase
- **Revertible accumulated data**: Note hashes, nullifiers, L2-L1 messages that can be reverted
- **Gas settings**: Limits for execution and teardown
- **Fee payer**: Address responsible for transaction fees

### Outputs

After execution, the AVM produces:

| Output             | Description                                |
| ------------------ | ------------------------------------------ |
| Note hashes        | Combined private + public note commitments |
| Nullifiers         | Combined private + public nullifiers       |
| L2-L1 messages     | Cross-chain messages to Ethereum           |
| Public logs        | Event data from public execution           |
| Public data writes | State updates to the public data tree      |
| End tree snapshots | Final state of all trees after execution   |
| Transaction fee    | Computed fee based on gas consumed         |
| Reverted flag      | Whether app logic phase reverted           |

## State Transitions

The AVM validates state transitions by tracking tree snapshots:

- **Start snapshots**: Tree roots before public execution
- **End snapshots**: Tree roots after all public functions complete

These snapshots are validated in the rollup circuits to ensure continuity across transactions in a block.

## Related Pages

- [Private Kernel](./private_kernel.md) – How private functions are processed
- [Private - Public Communication](../../../aztec-nr/framework-description/functions/public_private_calls.md) – How private and public functions interact
- [State Management](../../state_management.md) – How public and private state works
