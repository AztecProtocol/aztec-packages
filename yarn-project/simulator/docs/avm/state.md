# AVM State

The AVM manages two categories of state during execution: **world state** (persistent changes to the blockchain) and **execution state** (transient data local to a call).

## World State

World state represents persistent changes that are committed to the blockchain when a transaction succeeds. These are tracked during execution and only finalized after the entire transaction completes successfully.

| Component | Description |
|-----------|-------------|
| **Public Storage** | Contract storage slots (key-value mapping per contract) |
| **Nullifiers** | Unique identifiers that mark notes as "spent" |
| **Note Hashes** | Commitments to private notes |
| **L2-to-L1 Messages** | Messages sent from Aztec to Ethereum |
| **Public Logs** | Event logs emitted during public execution |

World state modifications accumulate during execution. If the top-level call reverts, all world state changes from the entire transaction are discarded.

## Execution State

Execution state is transient data that exists only during a call's execution. It is never persisted to the blockchain.

| Component | Description |
|-----------|-------------|
| **Memory** | The call's working memory (tagged field elements) |
| **Gas** | Remaining L2 and DA gas for this call |
| **Program Counter** | Current position in the bytecode |
| **Internal Call Stack** | Return addresses for [INTERNALCALL](opcodes/internalcall.md)/[INTERNALRETURN](opcodes/internalreturn.md) |
| **Nested Call Results** | Return data and success flag from the last external call |

Each [external call](external-calls.md) creates a new execution context with fresh execution state. Memory is **not** shared between calls—the caller and callee have completely independent memory spaces.

## State Isolation in Nested Calls

When a contract makes an [external call](external-calls.md), the AVM creates a **fork** of the current world state for the nested call to operate on. This fork is isolated from the caller:

- The nested call can read any world state (including the caller's uncommitted writes)
- The nested call's writes go to its own fork, not directly to the caller's state
- If the nested call succeeds, its fork is **merged** back into the caller's state
- If the nested call reverts, its fork is **discarded** entirely

This isolation means a reverted nested call cannot corrupt the caller's state. The caller can safely attempt calls and handle failures without risking its own accumulated state changes.

See [External Calls](external-calls.md) for details on how calls execute and how state is merged or discarded.
