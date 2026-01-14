# Enqueued Calls

This document explains how public function calls are enqueued during private execution and delivered to the AVM for execution.

## Overview

Aztec's execution model separates private and public execution:
- **Private execution** happens on the user's device before transaction submission
- **Public execution** happens on the network (sequencer) after the transaction is submitted

Since public functions need access to the current Aztec state (which isn't available client-side), private execution cannot directly execute public functions. Instead, it **enqueues** them—recording the intent to execute public code later.

## Definitions

### Public Call Request

A `PublicCallRequest` is a lightweight record of a public function call to be executed. It contains:

| Field | Description |
|-------|-------------|
| `msgSender` | Address of the caller (the private function's contract, or a null address if hidden) |
| `contractAddress` | Target contract to invoke |
| `isStaticCall` | Whether this is a read-only call (no state modifications allowed) |
| `calldataHash` | Hash of the function selector and arguments |

The actual calldata is stored separately in the transaction to reduce proof size. The calldata hash is _not_ validated by private-side protocol circuits. The protocol relies on the AVM to verify that the calldata in a transaction matches the hash in the `PublicCallRequest`.

### Enqueued Call

An **enqueued call** is a public call request that has been scheduled during private execution for later execution by the AVM. The term emphasizes that:
1. The call is not executed immediately
2. It will be processed later by the network
3. Its order relative to other enqueued calls is preserved via side-effect counters

**Public Call Request** and **Enqueued Call** are often used interchangeably.

## Enqueuing Public Calls from Private

During private execution, a contract can enqueue public calls using methods on the private context:

**Importantly, this is just pseudocode and does not reflect real interfaces for enqueueing calls.**

```noir
// Standard public function call
context.call_public_function(contract_address, selector, args);

// Read-only public call (no state changes allowed)
context.static_call_public_function(contract_address, selector, args);

// Teardown function (always executes, even if app logic reverts)
context.set_public_teardown_function(contract_address, selector, args);
```

When a public call is enqueued:
1. The calldata (selector + arguments) is hashed to produce `calldataHash`
2. The calldata preimage is accumulated for later inclusion in the transaction
3. A `PublicCallRequest` is created referencing the `calldataHash`
4. The request is added to the private context's accumulated requests
5. A side-effect counter tracks ordering relative to other enqueued calls

> **Note:** Enqueued calls (scheduled from private) are distinct from nested calls made via `CALL`/`STATICCALL` during AVM execution. Enqueued calls define the top-level public functions to execute; nested calls happen dynamically within those executions.

## Transaction Structure

After private execution completes, the transaction contains:

```
Transaction
├── Proof (proves correct private execution)
├── Side effects (from private execution)
├── Public Call Requests (each contains calldataHash)
│   ├── Non-revertible (setup phase)
│   ├── Revertible (app logic phase)
│   └── Teardown (optional, single call)
└── Public Call Calldata (raw fields, referenced by calldataHash)
    ├── [arg0, arg1, ...]
    └── ...
```

The kernel circuits aggregate all enqueued calls from nested private function calls and organize them by execution phase.

## Execution Phases

Enqueued calls are organized into three phases, each with different reversion semantics. See [Public Transaction Simulation](./public-tx-simulation.md) for detailed coverage of phase execution, rollback mechanics, and fee payment.

1. Setup Phase (Non-Revertible)
2. App Logic Phase (Revertible)
3. Teardown Phase (Revertible)

## Core AVM Execution

Each enqueued call triggers execution of the core AVM instruction-by-instruction (see [Execution Lifecycle](./execution-lifecycle.md)).

---
← Previous: [Introduction](./README.md) | Next: [Public Transaction Simulation](./public-tx-simulation.md) →
