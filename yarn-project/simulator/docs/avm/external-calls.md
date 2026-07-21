# External Calls

The AVM allows one contract's execution to make an **external call** to another contract (or even the same contract). Each external call initializes a new **nested execution context** that runs in isolation from the caller.

See [State](state.md) for background on world state vs execution state.

## Nested Execution Contexts

When [CALL](opcodes/call.md) or [STATICCALL](opcodes/staticcall.md) executes, the AVM creates a nested context for the callee:

**Fresh execution state:**
- Memory starts empty (caller and callee have separate memory spaces)
- Program counter resets to 0
- Internal call stack is empty
- Gas is allocated from the caller's remaining gas (see [Gas Allocation](#gas-allocation))
- `nestedCallSuccess` and `nestedReturndata` are reset

**Forked world state:**
- The callee operates on a fork of the caller's world state
- The callee can read the caller's uncommitted writes
- The callee's writes go to its own fork, isolated from the caller
- On success, the fork merges back; on revert, it's discarded

**Derived environment:**

The nested call inherits some environment fields unchanged and derives others:

| Field | Behavior | Description |
|-------|----------|-------------|
| `address` | **Changed** | Set to the target contract's address |
| `sender` | **Changed** | Set to the caller's contract address |
| `calldata` | **Changed** | Set to the arguments specified by the caller |
| `isStaticCall` | **Propagated** | `true` if caller is static OR if using STATICCALL (see [Static Calls](#static-calls)) |
| `transactionFee` | Inherited | Same as caller |
| `globals` | Inherited | Same as caller (block number, timestamp, etc.) |

## Transaction Limits

The AVM enforces limits on side effects per transaction. These limits exist because the ZK circuits that prove execution have fixed capacity.

### Unique Contract Class IDs

Each transaction can call contracts from at most **21 unique contract class IDs** (`MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS`). This counts distinct contract classes, not individual calls—calling the same contract multiple times only counts once.

If exceeded, the nested call fails with **SIDE_EFFECT_LIMIT_REACHED**. Control returns to the caller with `nestedCallSuccess = false`, allowing the caller to handle the failure via [SUCCESSCOPY](opcodes/successcopy.md).

**Important**: Unlike other side effects, unique contract class IDs are tracked even if the nested call reverts. Once a contract class is called, it counts toward the limit for the entire transaction, regardless of whether that call succeeds.

### Other Side Effect Limits

These limits apply transaction-wide (across all nested calls):

| Side Effect | Limit Constant | Error |
|-------------|----------------|-------|
| Storage writes | `MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX` | SIDE_EFFECT_LIMIT_REACHED |
| Nullifier emissions | `MAX_NULLIFIERS_PER_TX` | SIDE_EFFECT_LIMIT_REACHED |
| Note hash emissions | `MAX_NOTE_HASHES_PER_TX` | SIDE_EFFECT_LIMIT_REACHED |
| L2-to-L1 messages | `MAX_L2_TO_L1_MSGS_PER_TX` | SIDE_EFFECT_LIMIT_REACHED |
| Public log payload | `FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH` (total bytes) | SIDE_EFFECT_LIMIT_REACHED |

**Reverted side effects**: When a nested call reverts, its side effects (storage writes, nullifiers, note hashes, logs, messages) are discarded and do **not** count toward transaction limits. The exception is unique contract class IDs, which always count (see above).

## Gas Allocation

The caller specifies how much L2 and DA gas to allocate to the nested call via memory operands. The actual allocation follows these rules:

1. **Capped by available gas**: The allocated gas cannot exceed the caller's remaining gas. If the caller requests more than available, the allocation is silently capped.

2. **Charged immediately**: The full allocated amount is deducted from the caller's gas before the nested call begins.

3. **Refunded on completion**: When the nested call finishes via RETURN or REVERT, any unused gas is refunded to the caller. However, **exceptional halts** (errors) consume all allocated gas with no refund.

**Example**: If the caller has 10,000 L2 gas remaining and allocates 8,000 to a nested call:
- 8,000 is deducted from the caller (leaving 2,000)
- The nested call runs with 8,000 L2 gas
- If the nested call uses 3,000 and returns, 5,000 is refunded to the caller
- The caller now has 7,000 L2 gas remaining

## World State Isolation

The nested call's world state is **forked** from the caller's state. This means:

- **Reads see uncommitted writes**: The callee can read storage values written by the caller.

- **Writes are isolated**: The callee's storage writes, nullifier emissions, note hash emissions, logs, and messages go to its own fork—not directly to the caller's state.

- **Success merges the fork**: If the nested call returns successfully (via [RETURN](opcodes/return.md)), all its world state changes are merged into the caller's state.

- **Revert discards the fork**: If the nested call reverts (via [REVERT](opcodes/revert.md) or an error), all its world state changes are discarded. The caller's state is unchanged.

This isolation protects the caller from failed nested calls. A caller can attempt a call, check if it succeeded via [SUCCESSCOPY](opcodes/successcopy.md), and continue execution regardless of the outcome.

## RETURN vs REVERT vs error

Both instructions halt the nested call and return control to the caller:

| Aspect | [RETURN](opcodes/return.md) | [REVERT](opcodes/revert.md) | error |
|--------|------------------------------|------------------------------|-------|
| `nestedCallSuccess` | `true` | `false` | `false` |
| World state changes | Merged to caller | Discarded | Discarded |
| Gas refund | Unused gas returned | Unused gas returned | All allocated gas consumed |
| Output data | Return value(s) | Error message/data | None |

The caller retrieves the success flag via [SUCCESSCOPY](opcodes/successcopy.md) and the output data via [RETURNDATASIZE](opcodes/returndatasize.md) and [RETURNDATACOPY](opcodes/returndatacopy.md).

## Errors

Errors during nested execution (e.g., out of gas, invalid opcode, tag mismatch, side effect limit reached) cause an **exceptional halt**:

- Execution stops immediately at the faulting instruction
- **All remaining gas is consumed** (no refund for errors)
- `nestedCallSuccess` is set to `false`
- `nestedReturndata` is empty (no output data)
- All world state changes are discarded

This differs from an explicit REVERT, which refunds unused gas and can include output data.

### Some Error Types

This is not a comprehensive list. See individual opcode docs for more details.

| Error | Cause |
|-------|-------|
| OUT_OF_GAS | Insufficient gas for instruction |
| INVALID_TAG | Operand tag is not valid for the operation |
| TAG_MISMATCH | Type tag mismatch between operands |
| MEMORY_ACCESS_OUT_OF_RANGE | Memory offset exceeds addressable space |
| SIDE_EFFECT_LIMIT_REACHED | Transaction limit exceeded (see [Transaction Limits](#transaction-limits)) |
| STATIC_CALL_VIOLATION | State modification attempted in static context |


## Static Calls

[STATICCALL](opcodes/staticcall.md) enforces **read-only execution**. The nested call (and any calls it makes) cannot modify world state.

**Blocked operations** (cause STATIC_CALL_VIOLATION error if attempted):
- Storage writes ([SSTORE](opcodes/sstore.md))
- Nullifier emissions ([EMITNULLIFIER](opcodes/emitnullifier.md))
- Note hash emissions ([EMITNOTEHASH](opcodes/emitnotehash.md))
- Log emissions ([EMITPUBLICLOG](opcodes/emitpubliclog.md))
- L2-to-L1 messages ([SENDL2TOL1MSG](opcodes/sendl2tol1msg.md))

**Allowed operations**:
- Storage reads ([SLOAD](opcodes/sload.md))
- Existence checks (nullifiers, note hashes, L1-to-L2 messages)
- All computation and memory operations (even memory writes)
- Nested calls (which inherit the static restriction)

**Propagation**: If a call is static, all nested calls from it are also static. A contract cannot "escape" read-only mode by making a regular CALL.

Static calls are useful for safely querying untrusted contracts without risking unintended state changes.

## Example: Nested Call with Error Handling

```
// Caller has 10,000 L2 gas
// Allocate 5,000 gas for nested call to contract B

CALL(l2Gas=5000, daGas=100, addr=B, args=[1,2,3])

// After call:
// - Caller has ~5,000 L2 gas (5,000 kept + refund from B)
// - nestedCallSuccess indicates if B returned or reverted
// - nestedReturndata contains B's output

SUCCESSCOPY(dstOffset=100)    // M[100] = 0 (failed) or 1 (success)
JUMPI(successPath, 100)       // JUMPI jumps when M[100] != 0, i.e., on success

// Failure path (success == 0): B's state changes are discarded
// Caller can inspect revert data or take alternative action
JUMP(done)

successPath:
// Success path (success == 1): B's state changes are merged
RETURNDATASIZE(dstOffset=101) // Get return data size
RETURNDATACOPY(...)           // Copy return data to memory
// ... continue processing

done:
```

---
← Previous: [Errors](./errors.md) | Next: [Calldata and Return Data](./calldata-returndata.md) →
