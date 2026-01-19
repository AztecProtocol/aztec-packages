[&larr; Back to Instruction Set: Quick Reference](../avm-isa-quick-reference.md)

# NULLIFIEREXISTS

Check existence of nullifier

Opcode `0x33`

```javascript
M[existsOffset] = nullifierTree.exists(M[addressOffset], M[nullifierOffset]) ? 1 : 0
```

## Details

Performs a read of the Nullifier Tree to query whether the specified nullifier exists for the given contract address. Any contract address can be specified, not just the currently executing contract. Both address and nullifier must be FIELD. Result is Uint1.

## Gas Costs

| Component | Value | Scales with |
|-----------|-------|-------------|
| L2 Base | 924 | - |
| DA Base | 0 | - |
| L2 Addressing | 3 | 3 L2 gas per indirect memory offset<br/>3 L2 gas per relative memory offset |

\* See [Gas Metering](../gas.md) for details on how gas costs are computed and applied.

## Operands

| Name | Type | Description |
|------|------|-------------|
| `nullifierOffset` | Memory offset | Memory offset of the nullifier to check |
| `addressOffset` | Memory offset | Memory offset of the contract address |
| `existsOffset` | Memory offset | Memory offset where the result (0 or 1) will be written |

## Wire Formats
See [Wire Format](../wire-format.md) page for an explanation of wire format variants and opcode naming (e.g., why `ADD_8` vs `ADD_16`).

**NULLIFIEREXISTS** (Opcode 0x33):

```mermaid
---
title: "NULLIFIEREXISTS"
config:
  packet:
    bitsPerRow: 64
---
packet-beta
0-7: "Opcode (0x33)"
8-15: "Addressing modes"
16-31: "Operand: nullifierOffset"
32-47: "Operand: addressOffset"
48-63: "Operand: existsOffset"
```

## Addressing Modes
See [Addressing](../addressing.md) page for a detailed explanation.

8-bit bitmask: 2 bits per memory offset operand (indirect flag + relative flag)

Memory offset operands (`nullifierOffset`, `addressOffset`, `existsOffset`) are encoded as follows:

```mermaid
---
title: "Addressing Mode Bitmask"
config:
  packet:
    bitWidth: 128
    bitsPerRow: 8
---
packet-beta
  0: "nullifierOffset is indirect"
  1: "nullifierOffset is relative"
  2: "addressOffset is indirect"
  3: "addressOffset is relative"
  4: "existsOffset is indirect"
  5: "existsOffset is relative"
  6: "Unused"
  7: "Unused"
```

## Tag Checks

- `T[addressOffset] == FIELD`
- `T[nullifierOffset] == FIELD`

## Tag Updates

- `T[existsOffset] = UINT1`

## Error Conditions

- **INVALID_TAG**: Address or nullifier is not FIELD
- **MEMORY_ACCESS_OUT_OF_RANGE**: Memory offset operand exceeds addressable memory

---

[&larr; Back to Instruction Set: Quick Reference](../avm-isa-quick-reference.md)
