[&larr; Back to Instruction Set: Quick Reference](../avm-isa-quick-reference.md)

# ECADD

Grumpkin elliptic curve addition

Opcode `0x42`

```javascript
M[dstOffset:dstOffset+3] = grumpkinAdd(
        /*point1=*/{x: M[p1XOffset], y: M[p1YOffset], isInfinite: M[p1IsInfiniteOffset]},
        /*point2=*/{x: M[p2XOffset], y: M[p2YOffset], isInfinite: M[p2IsInfiniteOffset]}
    )
```

## Details

Performs elliptic curve point addition on the Grumpkin curve. Each point is represented as (x: FIELD, y: FIELD, isInfinite: Uint1). Returns result point in same format.

## Gas Costs

| Component | Value | Scales with |
|-----------|-------|-------------|
| L2 Base | 27 | - |
| DA Base | 0 | - |
| L2 Addressing | 3 | 3 L2 gas per indirect memory offset<br/>3 L2 gas per relative memory offset |

*See [Gas Metering](gas.md) for details on how gas costs are computed and applied.

## Operands

| Name | Type | Description |
|------|------|-------------|
| `p1XOffset` | Memory offset | Memory offset of the first point's x-coordinate |
| `p1YOffset` | Memory offset | Memory offset of the first point's y-coordinate |
| `p1IsInfiniteOffset` | Memory offset | Memory offset of the first point's infinity flag |
| `p2XOffset` | Memory offset | Memory offset of the second point's x-coordinate |
| `p2YOffset` | Memory offset | Memory offset of the second point's y-coordinate |
| `p2IsInfiniteOffset` | Memory offset | Memory offset of the second point's infinity flag |
| `dstOffset` | Memory offset | Memory offset for result point will be written (3 values) |

## Wire Formats
See [Wire Format](wire-format.md) page for an explanation of wire format variants and opcode naming (e.g., why `ADD_8` vs `ADD_16`).

**ECADD** (Opcode 0x42):

```mermaid
---
title: "ECADD"
config:
  packet:
    bitsPerRow: 64
---
packet-beta
0-7: "Opcode (0x42)"
8-23: "Addressing modes"
24-39: "Operand: p1XOffset"
40-55: "Operand: p1YOffset"
56-71: "Operand: p1IsInfiniteOffset"
72-87: "Operand: p2XOffset"
88-103: "Operand: p2YOffset"
104-119: "Operand: p2IsInfiniteOffset"
120-135: "Operand: dstOffset"
```

## Addressing Modes
See [Addressing](addressing.md) page for a detailed explanation.

16-bit bitmask: 2 bits per memory offset operand (indirect flag + relative flag)

Memory offset operands (`p1XOffset`, `p1YOffset`, `p1IsInfiniteOffset`, `p2XOffset`, `p2YOffset`, `p2IsInfiniteOffset`, `dstOffset`) are encoded as follows:

```mermaid
---
title: "Addressing Mode Bitmask"
config:
  packet:
    bitWidth: 128
    bitsPerRow: 8
---
packet-beta
  0: "p1XOffset is indirect"
  1: "p1XOffset is relative"
  2: "p1YOffset is indirect"
  3: "p1YOffset is relative"
  4: "p1IsInfiniteOffset is indirect"
  5: "p1IsInfiniteOffset is relative"
  6: "p2XOffset is indirect"
  7: "p2XOffset is relative"
  8: "p2YOffset is indirect"
  9: "p2YOffset is relative"
  10: "p2IsInfiniteOffset is indirect"
  11: "p2IsInfiniteOffset is relative"
  12: "dstOffset is indirect"
  13: "dstOffset is relative"
  14: "Unused"
  15: "Unused"
```

## Tag Checks

- `T[p1XOffset] == FIELD`
- `T[p1YOffset] == FIELD`
- `T[p1IsInfiniteOffset] == UINT1`
- `T[p2XOffset] == FIELD`
- `T[p2YOffset] == FIELD`
- `T[p2IsInfiniteOffset] == UINT1`

## Tag Updates

- `T[dstOffset] = FIELD`
- `T[dstOffset+1] = FIELD`
- `T[dstOffset+2] = UINT1`

## Error Conditions

- **INVALID_TAG**: Point coordinates are not FIELD or infinity flags are not Uint1
- **POINT_NOT_ON_CURVE**: One or both points are not on the Grumpkin curve
- **MEMORY_ACCESS_OUT_OF_RANGE**: Memory offset operand exceeds addressable memory

---

[&larr; Back to Instruction Set: Quick Reference](../avm-isa-quick-reference.md)