---
title: Private Kernel Circuit
sidebar_position: 1
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

## Performance Impact

The kernel circuits add significant overhead to every transaction. Understanding this overhead is important when designing contracts and profiling performance.

### Gate counts per phase

Consider a typical transaction where a user calls a single contract function. This actually involves **two** private function calls — the account entrypoint (e.g. `SchnorrAccount:entrypoint`) and your contract function — so the kernel processes both:

```text
Account entrypoint:      22,000 gates   (1st private call → processed by init)
Your function:           14,000 gates   (2nd private call → processed by inner)
private_kernel_init:     ~46,000 gates
private_kernel_inner:   ~101,000 gates
private_kernel_reset:   ~200,000 gates
private_kernel_tail:     ~44,000 gates
─────────────────────────────────────
Total transaction:      ~427,000 gates
```

The init circuit handles the first private function call (the account entrypoint), and inner handles each subsequent one. The exact kernel gate counts vary depending on the transaction's complexity (number of note hashes, nullifiers, read requests, etc.), but the key takeaway is: **kernel overhead is substantial and scales with the number of private function calls**.

Each additional private function call in a transaction adds at least one more kernel inner circuit (~101k gates). This means that architectural decisions — like whether to inline logic into one function vs. splitting across multiple function calls — can have a significant impact on total proving time.

:::tip Design tip
When profiling shows high gate counts, consider whether you can reduce the number of distinct private function calls in your transaction. For example, inlining a verification step into the calling function saves an entire kernel fold (~101k gates), even if it slightly increases the calling function's own gate count.
:::

:::info Large circuits do not prevent transaction inclusion

A contract with a high gate count is **not** uncallable. The only effect of a large circuit is that it takes longer to prove on the client. Your transaction will still be included in a block as long as it is valid by the time the proof is submitted.

In practice, there are only two edge cases where slow proving could cause issues:

1. **Transaction expiry**: If proving takes so long (e.g. over an hour) that the transaction becomes invalid by the time you're done. This is unlikely for most use cases.
2. **Fee volatility**: If network fees increase rapidly while you're proving, your transaction may be underpriced by the time it's broadcast. This is similar to signing an Ethereum transaction and waiting before submitting it. You can mitigate this by overpaying for fees if rapid inclusion is a priority.

One of the major benefits of Aztec is that private computation is proven client-side: you can do as much computation as you want in private functions — the network cost is the same regardless.
:::

For tools to measure these costs, see the [profiling guide](../../../aztec-nr/framework-description/advanced/how_to_profile_transactions.md).

## Related Pages

- [Transactions](../../transactions.md) - How private kernel fits into transaction execution
- [Public Execution](./public_execution.md) - How public functions are executed by the AVM
- [Profiling Transactions](../../../aztec-nr/framework-description/advanced/how_to_profile_transactions.md) - Measuring gate counts and identifying bottlenecks
- [Writing Efficient Contracts](../../../aztec-nr/framework-description/advanced/writing_efficient_contracts.md) - Optimization strategies
