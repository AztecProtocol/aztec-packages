# Calldata and Return Data

This document explains how data is passed into and out of AVM execution contexts.

## Overview

The AVM uses memory-based data passing for nested calls:
- **Calldata**: Input arguments passed to a contract.
- **Return data**: Output values returned from a nested call

Unlike the EVM, the AVM uses field elements (not raw bytes). Calldata is _always_ fields.

## Calldata

### Accessing Calldata

The current context's calldata is accessed via:
- `CALLDATASIZE` — Returns the number of field elements in calldata
- `CALLDATACOPY` — Copies calldata to memory

```
CALLDATASIZE dstOffset       // M[dstOffset] = calldata.length
CALLDATACOPY cdOffset size copyOffset  // Copy calldata[cdOffset..cdOffset+size] to M[copyOffset..]
```

### Passing Calldata to Nested Calls

When making a `CALL` or `STATICCALL`, the caller specifies calldata via memory:
- `argsOffset` — Memory offset where arguments start
- `argsSize` — Number of field elements to pass

The callee receives these values as its calldata. The values are copied from the caller's memory—type tags are not preserved in the transfer. Calldata is _always_ received by the callee as field elements and _the callee is responsible for casting inputs to the expected types if strict type safety is required._

**Note**: `CALL` (and `STATICCALL`) only _set_ the calldata parameters—they don't immediately copy or validate memory access. If callee attempts to read from a memory address ≥ 2³² in the caller's memory via `CALLDATACOPY` , an error occurs in the callee's context. Reading past the logical calldata size (beyond `argsSize`) is not an error—it returns zeros.

## Return Data

### Returning Data

A context returns data via the `RETURN` instruction:
- `retOffset` — Memory offset where return data starts
- `retSize` — Number of field elements to return

On `REVERT`, the same parameters specify revert data.

**Note**: `RETURN` (and `REVERT`) only _set_ the return data parameters—they don't immediately copy or validate memory access. If caller attempts to read from a memory address ≥ 2³² in the callee's memory via `RETURNDATACOPY` , an error occurs in the caller's context. Reading past the logical return data size (beyond `retSize`) is not an error—it returns zeros.

### Accessing Return Data

After a nested call completes, the caller accesses return data via:
- `RETURNDATASIZE` — Returns the number of field elements returned
- `RETURNDATACOPY` — Copies return data to memory
- `SUCCESSCOPY` — Copies the success flag (0 or 1)

```
// After a nested call
SUCCESSCOPY dstOffset        // M[dstOffset] = 0 (failed) or 1 (success)
RETURNDATASIZE dstOffset     // M[dstOffset] = returndata.length
RETURNDATACOPY rdOffset size memOffset  // Copy returndata[rdOffset..] to M[memOffset..]
```

**Important**: Return data is only available from the most recent external call. Making another call overwrites the return data buffer.

## Data Layout

The AVM does not enforce any specific encoding for calldata or return data. Conventions are determined by the compiler (Noir) and contract design. Typical patterns:

- Arguments are laid out sequentially as field elements
- Structs and arrays follow compiler-defined layouts
- No function selectors at the AVM level (generally injected by the compiler alongside function dispatch logic)

## Example: Forwarding a Call

```
// Forward all calldata to another contract
CALLDATASIZE cdSizeOffset    // Get calldata size
CALLDATACOPY 0 M[cdSizeOffset] 0  // Copy all calldata to M[0..]
CALL ... 0 M[cdSizeOffset] ...    // Pass M[0..size] as calldata
```

---
← Previous: [External Calls](./external-calls.md) | Next: [Wire Formats](./wire-format.md) →
