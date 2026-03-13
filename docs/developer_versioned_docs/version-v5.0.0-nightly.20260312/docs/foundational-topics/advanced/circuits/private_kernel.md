---
title: Private Kernel Circuit
sidebar_position: 0
tags: [protocol, circuits]
description: Learn about the Private Kernel Circuit, the only zero-knowledge circuit in Aztec that handles private data and ensures transaction privacy by executing on user devices.
---

The private kernel circuit is executed by the user on their own device. This ensures private inputs remain private.

:::note
This is the only core protocol circuit that truly requires the "zero-knowledge" property. Other circuits use SNARKs for succinct verification, but don't need to hide witness data. The private kernel must hide: the contract function executed, the user's address, and the function's inputs and outputs.
:::

## Overview

The private kernel processes all private function calls in a transaction, accumulating their side effects (note hashes, nullifiers, logs, messages) and validation requests. It runs recursively—once per private function call—building up a proof that all private execution was correct.

The kernel validates:
- Proof of private function execution
- Correct call context (caller, address, arguments)
- Proper scoping of side effects to their originating contract
- Uniqueness and ordering of side effect counters

## Kernel Phases

The private kernel consists of five circuit types:

### Init

The entry point for private kernel execution. It processes the first private function call in a transaction and validates:
- The call matches the transaction request (origin, function, arguments)
- The function is marked as private
- No msg_sender exists (first call has no caller)

### Inner

Processes subsequent private function calls after init. Can chain multiple times as the call stack grows. It:
- Verifies the previous kernel proof
- Pops the next call from the private call stack
- Validates the call matches its request
- Appends new side effects to accumulated data

### Reset

Can be called one or more times at any point after init and before tail/tail-to-public. Optimizes the accumulated data by:

- Squashing transient note hash/nullifier pairs (where a note is created and nullified within the same transaction) along with their associated logs
- Validating note hash and nullifier read requests against the state
- Validating key validation requests

This circuit reduces the data size before finalization.

### Tail

The final circuit for **private-only** transactions (no public function calls). It:
- Sorts remaining side effects
- Converts accumulated data to rollup format
- Produces output ready for rollup aggregation

### Tail to Public

The bridge circuit for transactions with both private and public execution. It:
- Splits side effects into non-revertible and revertible arrays
- Prepares data for public execution
- Handles the transition from private to public phases

## Data Flow

As the kernel processes each private call, it accumulates:

| Data Type | Description |
|-----------|-------------|
| Note hashes | Commitments to new private notes |
| Nullifiers | Markers that invalidate notes or provide uniqueness |
| L2 to L1 messages | Cross-chain messages to Ethereum |
| Private logs | Encrypted event data |
| Public call requests | Queued public function calls |

Each item is scoped with the contract address that emitted it, ensuring proper attribution.

## Related Pages

- [Transactions](../../transactions.md) - How private kernel fits into transaction execution
- [Public Execution](./public_execution.md) - How public functions are executed by the AVM
