# Execution Lifecycle

This document describes the AVM execution lifecycle. It focuses on control-flow rules, halts, gas and state changes.

## VM Initialization

On creation of a VM execution context (top-level call or a nested CALL/STATICCALL frame), the VM initializes:

- **Program Counter (PC)**: Set to `0`
- **Memory**: Initialized as empty
- **Gas Limits**: Derived from the enqueued call (top-level call initiated from private) or call instruction parameters (nested). The AVM tracks two gas dimensions: L2 gas and DA gas.
- **Internal Call Stack**: Starts empty (used by INTERNALCALL/INTERNALRETURN)

A CALL/STATICCALL creates a fresh execution context; it does not reuse the caller's memory, PC, or internal call stack.

## Program Counter

The VM executes instructions at `PC`, which is a **byte offset** into the bytecode (not an instruction index). Unless an instruction specifies otherwise, control flow advances by instruction byte length:

- **Default**: `PC += instruction_size_bytes`
- **JUMP**: `PC = target`
- **JUMPI**: If `condition != 0`, `PC = target`; otherwise advances normally
- **INTERNALCALL**: Pushes the return address onto the internal call stack, then sets `PC = target`
- **INTERNALRETURN**: Pops from the internal call stack and sets `PC` to that value
- **CALL/STATICCALL**: Creates a nested execution context; the caller's `PC` is not modified by the callee's control flow (the caller continues at its next instruction after the call completes)

## Gas Charging Order

Each instruction validates inputs, charges gas, executes, then writes outputs. Base and addressing costs are charged before operand resolution; dynamic costs are charged after. See [Gas Metering](gas.md) for cost components and calculation.

## Call Frame/Context Management

The AVM uses a "Fork and Merge" model for nested execution via `CALL` and `STATICCALL`:

**Creation**:
- Fresh memory and fresh `PC` (starting at 0)
- Forked world state (callee sees a snapshot derived from the caller's state)
- Gas limit set to the amount the caller explicitly allocated for this call

**Resolution**:
- **Success (RETURN)**: State changes are merged into the caller
- **Failure (REVERT)**: State changes are discarded; unused gas is returned to caller
- **Exceptional halt**: State changes are discarded; all allocated gas is consumed (no refund)

## Halting Conditions

Execution halts and the VM produces a completion result.

**Normal halts**:
- **RETURN**: Halts with `success = true` and return data
- **REVERT**: Halts with `success = false` and revert data

**Exceptional halts (errors)**:

Exceptional halts stop execution immediately. For call-frame merging, exceptional halts are treated the same as REVERT (state discarded), but they consume all allocated gas.

For a complete list of errors that trigger exceptional halts, see [Errors](errors.md). Common examples include:
- `OUT_OF_GAS`: Insufficient gas for instruction
- `TAG_MISMATCH`: Type tag mismatch on operands

---
← Previous: [Addressing Modes](./addressing.md) | Next: [Gas Metering](./gas.md) →
