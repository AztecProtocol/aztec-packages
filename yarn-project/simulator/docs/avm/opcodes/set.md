[&larr; Back to Instruction Set: Quick Reference](../avm-isa-quick-reference.md)

# SET

Set memory to immediate value

Opcodes `0x27`-`0x2C` (6 wire formats)

```javascript
M[dstOffset] = value
```

## Details

Stores an immediate value (a constant encoded directly in the bytecode) at the specified memory offset with the given type tag. Multiple wire formats support different value sizes.

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
| `dstOffset` | Memory offset | Memory offset for value will be stored |
| `inTag` | Type tag | Type tag to assign to the value. Unrelated to the opcode's wire format (`SET_8` vs `SET_16`, etc.) |
| `value` | Immediate value | Constant from the bytecode to store into memory |

## Wire Formats
See [Wire Format](wire-format.md) page for an explanation of wire format variants and opcode naming (e.g., why `ADD_8` vs `ADD_16`).

**SET_8** (Opcode 0x27):

```mermaid
---
title: "SET_8"
config:
  packet:
    bitsPerRow: 40
---
packet-beta
0-7: "Opcode (0x27)"
8-15: "Addressing modes"
16-23: "Operand: dstOffset"
24-31: "Operand: inTag"
32-39: "Operand: value"
```

**SET_16** (Opcode 0x28):

```mermaid
---
title: "SET_16"
config:
  packet:
    bitsPerRow: 56
---
packet-beta
0-7: "Opcode (0x28)"
8-15: "Addressing modes"
16-31: "Operand: dstOffset"
32-39: "Operand: inTag"
40-55: "Operand: value"
```

**SET_32** (Opcode 0x29):

```mermaid
---
title: "SET_32"
config:
  packet:
    bitsPerRow: 64
---
packet-beta
0-7: "Opcode (0x29)"
8-15: "Addressing modes"
16-31: "Operand: dstOffset"
32-39: "Operand: inTag"
40-71: "Operand: value"
```

**SET_64** (Opcode 0x2A):

```mermaid
---
title: "SET_64"
config:
  packet:
    bitsPerRow: 64
---
packet-beta
0-7: "Opcode (0x2A)"
8-15: "Addressing modes"
16-31: "Operand: dstOffset"
32-39: "Operand: inTag"
40-103: "Operand: value"
```

**SET_128** (Opcode 0x2B):

```mermaid
---
title: "SET_128"
config:
  packet:
    bitsPerRow: 64
---
packet-beta
0-7: "Opcode (0x2B)"
8-15: "Addressing modes"
16-31: "Operand: dstOffset"
32-39: "Operand: inTag"
40-167: "Operand: value"
```

**SET_FF** (Opcode 0x2C):

```mermaid
---
title: "SET_FF"
config:
  packet:
    bitsPerRow: 64
---
packet-beta
0-7: "Opcode (0x2C)"
8-15: "Addressing modes"
16-31: "Operand: dstOffset"
32-39: "Operand: inTag"
40-295: "Operand: value"
```

## Addressing Modes
See [Addressing](addressing.md) page for a detailed explanation.

8-bit bitmask: 2 bits per memory offset operand (indirect flag + relative flag)

Memory offset operands (`dstOffset`) are encoded as follows:

```mermaid
---
title: "Addressing Mode Bitmask"
config:
  packet:
    bitWidth: 128
    bitsPerRow: 8
---
packet-beta
  0: "dstOffset is indirect"
  1: "dstOffset is relative"
  2: "Unused"
  3: "Unused"
  4: "Unused"
  5: "Unused"
  6: "Unused"
  7: "Unused"
```

## Tag Updates

- `T[dstOffset] = tag`

## Error Conditions

- **INVALID_TAG**: Specified tag is not a valid TypeTag
- **MEMORY_ACCESS_OUT_OF_RANGE**: Memory offset operand exceeds addressable memory

---

[&larr; Back to Instruction Set: Quick Reference](../avm-isa-quick-reference.md)