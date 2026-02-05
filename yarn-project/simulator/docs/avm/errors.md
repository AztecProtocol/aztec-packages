# Errors

This document provides a reference for AVM errors and their trigger conditions.

## Overview

An **error** occurs when the AVM encounters an invalid condition during execution. An error leads to an **exceptional halt**, stopping execution of the current context immediately. This differs from the two other ways execution can halt: explicit RETURN opcode and explicit REVERT opcode.

## Error Reference

| Error | Trigger | Category | During Private Insertions? |
|-------|---------|----------|-------------------|
| `INVALID_PROGRAM_COUNTER` | PC points beyond bytecode bounds | Instruction fetch | No |
| `INVALID_OPCODE` | PC points to an unrecognized opcode byte | Instruction fetch | No |
| `INSTRUCTION_PARSING_ERROR` | Malformed instruction encoding | Instruction fetch | No |
| `OUT_OF_GAS` | Insufficient L2 gas or DA gas for instruction | Gas charging | No |
| `TAG_MISMATCH` | Type tag mismatch between operands | Validation | No |
| `INVALID_TAG` | Operand tag is not valid for the operation | Validation | No |
| `INVALID_TAG_TYPE` | Operand is not an integral type (for bitwise/div ops) | Validation | No |
| `MEMORY_ACCESS_OUT_OF_RANGE` | Memory offset exceeds 32-bit addressable space | Validation | No |
| `RELATIVE_ADDRESS_OVERFLOW` | Base address + relative offset exceeds max memory | Validation | No |
| `STATIC_CALL_VIOLATION` | State-modifying operation in static context | Execution | No |
| `SIDE_EFFECT_LIMIT_REACHED` | Transaction limit exceeded for a side effect type | Execution | Yes |
| `NULLIFIER_COLLISION` | Emitted nullifier already exists | Execution (opcode-specific) | Yes |
| `INTERNAL_CALL_STACK_UNDERFLOW` | INTERNALRETURN with empty internal call stack | Execution (opcode-specific) | No |
| `DIVISION_BY_ZERO` | Division or modulo operation with divisor = 0 | Execution (opcode-specific) | No |
| `POINT_NOT_ON_CURVE` | ECADD operand is not a valid Grumpkin curve point | Execution (opcode-specific) | No |
| `INVALID_RADIX` | TORADIXBE radix not in range [2, 256] | Execution (opcode-specific) | No |
| `INVALID_DECOMPOSITION` | TORADIXBE value cannot be decomposed into specified radix/limbs | Execution (opcode-specific) | No |
| `INVALID_ENV_VAR` | GETENVVAR enum value out of range | Execution (opcode-specific) | No |
| `INVALID_MEMBER_ENUM` | GETCONTRACTINSTANCE member enum out of range | Execution (opcode-specific) | No |


## Error Behavior Summary

| Halt | Outcome | Gas Behavior | State Behavior | Example |
|---------|---------|--------------|----------------|---------|
| **Exceptional halt** | Failure | All allocated gas consumed | Changes discarded | `OUT_OF_GAS`, `TAG_MISMATCH` |
| **Explicit REVERT** | Failure | Unused gas refunded | Changes discarded | REVERT instruction |
| **Explicit RETURN** | Success | Unused gas refunded | Changes merged | RETURN instruction |


---
← Previous: [Gas Metering](./gas.md) | Next: [External Calls](./external-calls.md) →
