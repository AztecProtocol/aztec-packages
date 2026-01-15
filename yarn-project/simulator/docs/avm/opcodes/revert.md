[&larr; Back to Instruction Set: Quick Reference](../avm-isa-quick-reference.md)

# REVERT

Revert execution

Opcodes `0x3C`-`0x3D` (2 wire formats)

```javascript
exposeRevertData(offset: returnOffset, size: M[retSizeOffset])
halt
```

## Details

Halts execution with revert status and returns error data to the caller. Revert size must be Uint32. Undoes state changes. Caller can access this context's `M[offset:offset+size]` via RETURNDATACOPY.

## Gas Costs

| Component | Value | Scales with |
|-----------|-------|-------------|
| L2 Base | 9 | - |
| DA Base | 0 | - |
| L2 Addressing | 3 | 3 L2 gas per indirect memory offset<br/>3 L2 gas per relative memory offset |

*See [Gas Metering](gas.md) for details on how gas costs are computed and applied.

## Operands

| Name | Type | Description |
|------|------|-------------|
| `retSizeOffset` | Memory offset | Memory offset of the revert data size |
| `returnOffset` | Memory offset | Memory offset of the start of the revert data |

## Wire Formats
See [Wire Format](wire-format.md) page for an explanation of wire format variants and opcode naming (e.g., why `ADD_8` vs `ADD_16`).

**REVERT_8** (Opcode 0x3C):

```mermaid
---
title: "REVERT_8"
config:
  packet:
    bitsPerRow: 32
---
packet-beta
0-7: "Opcode (0x3C)"
8-15: "Addressing modes"
16-23: "Operand: retSizeOffset"
24-31: "Operand: returnOffset"
```

**REVERT_16** (Opcode 0x3D):

```mermaid
---
title: "REVERT_16"
config:
  packet:
    bitsPerRow: 48
---
packet-beta
0-7: "Opcode (0x3D)"
8-15: "Addressing modes"
16-31: "Operand: retSizeOffset"
32-47: "Operand: returnOffset"
```

## Addressing Modes
See [Addressing](addressing.md) page for a detailed explanation.

8-bit bitmask: 2 bits per memory offset operand (indirect flag + relative flag)

Memory offset operands (`retSizeOffset`, `returnOffset`) are encoded as follows:

```mermaid
---
title: "Addressing Mode Bitmask"
config:
  packet:
    bitWidth: 128
    bitsPerRow: 8
---
packet-beta
  0: "retSizeOffset is indirect"
  1: "retSizeOffset is relative"
  2: "returnOffset is indirect"
  3: "returnOffset is relative"
  4: "Unused"
  5: "Unused"
  6: "Unused"
  7: "Unused"
```

## Tag Checks

- `T[retSizeOffset] == UINT32`

## Error Conditions

- **INVALID_TAG**: Revert size operand is not Uint32
- **MEMORY_ACCESS_OUT_OF_RANGE**: Memory offset operand exceeds addressable memory

## Notes

- See [External Calls](../external-calls.md) for more details on execution flow.
- See [Calldata and Return Data](../calldata-returndata.md) for more details on passing data.

---

[&larr; Back to Instruction Set: Quick Reference](../avm-isa-quick-reference.md)