[&larr; Back to Instruction Set: Quick Reference](../avm-isa-quick-reference.md)

# SHL

Shift left (a &lt;&lt; b)

Opcodes `0x18`-`0x19` (2 wire formats)

```javascript
M[dstOffset] = M[aOffset] << M[bOffset]
```

## Details

Performs left bit shift. Both operands must have the same integral type tag (UINT1, UINT8, UINT16, UINT32, UINT64, UINT128). The result is computed modulo 2^k where k is the bit-width of the operand type (e.g., k=8 for UINT8). The result inherits the tag from the operands.

## Gas Costs

| Component | Value | Scales with |
|-----------|-------|-------------|
| L2 Base | 18 | - |
| DA Base | 0 | - |
| L2 Addressing | 3 | 3 L2 gas per indirect memory offset<br/>3 L2 gas per relative memory offset |

*See [Gas Metering](gas.md) for details on how gas costs are computed and applied.

## Operands

| Name | Type | Description |
|------|------|-------------|
| `aOffset` | Memory offset | Memory offset of the value to shift |
| `bOffset` | Memory offset | Memory offset of the shift amount |
| `dstOffset` | Memory offset | Memory offset for result |

## Wire Formats
See [Wire Format](wire-format.md) page for an explanation of wire format variants and opcode naming (e.g., why `ADD_8` vs `ADD_16`).

**SHL_8** (Opcode 0x18):

```mermaid
---
title: "SHL_8"
config:
  packet:
    bitsPerRow: 40
---
packet-beta
0-7: "Opcode (0x18)"
8-15: "Addressing modes"
16-23: "Operand: aOffset"
24-31: "Operand: bOffset"
32-39: "Operand: dstOffset"
```

**SHL_16** (Opcode 0x19):

```mermaid
---
title: "SHL_16"
config:
  packet:
    bitsPerRow: 64
---
packet-beta
0-7: "Opcode (0x19)"
8-15: "Addressing modes"
16-31: "Operand: aOffset"
32-47: "Operand: bOffset"
48-63: "Operand: dstOffset"
```

## Addressing Modes
See [Addressing](addressing.md) page for a detailed explanation.

8-bit bitmask: 2 bits per memory offset operand (indirect flag + relative flag)

Memory offset operands (`aOffset`, `bOffset`, `dstOffset`) are encoded as follows:

```mermaid
---
title: "Addressing Mode Bitmask"
config:
  packet:
    bitWidth: 128
    bitsPerRow: 8
---
packet-beta
  0: "aOffset is indirect"
  1: "aOffset is relative"
  2: "bOffset is indirect"
  3: "bOffset is relative"
  4: "dstOffset is indirect"
  5: "dstOffset is relative"
  6: "Unused"
  7: "Unused"
```

## Tag Checks

- `T[aOffset] == T[bOffset]`

## Tag Updates

- `T[dstOffset] = T[aOffset]`

## Error Conditions

- **TAG_MISMATCH**: Operands have different type tags
- **MEMORY_ACCESS_OUT_OF_RANGE**: Memory offset operand exceeds addressable memory

---

[&larr; Back to Instruction Set: Quick Reference](../avm-isa-quick-reference.md)