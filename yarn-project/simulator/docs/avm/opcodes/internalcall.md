[&larr; Back to Instruction Set: Quick Reference](../avm-isa-quick-reference.md)

# INTERNALCALL

Internal function call

Opcode `0x25`

```javascript
internalCallStack.push({callPc: PC, returnPc: PC + instructionSize}); PC = loc
```

## Details

Pushes current PC and return PC onto internal call stack, then jumps to the target location. While this instruction itself does not validate the jump target, an invalid target will trigger an instruction fetching error at the start of the next instruction's processing.

## Gas Costs

| Component | Value |
|-----------|-------|
| L2 Base | 9 |
| DA Base | 0 |

\* See [Gas Metering](gas.md) for details on how gas costs are computed and applied.

## Operands

| Name | Type | Description |
|------|------|-------------|
| `loc` | Memory offset | Immediate bytecode offset of the function to call |

## Wire Formats
See [Wire Format](wire-format.md) page for an explanation of wire format variants and opcode naming (e.g., why `ADD_8` vs `ADD_16`).

**INTERNALCALL** (Opcode 0x25):

```mermaid
---
title: "INTERNALCALL"
config:
  packet:
    bitsPerRow: 40
---
packet-beta
0-7: "Opcode (0x25)"
8-39: "Operand: loc"
```

---

[&larr; Back to Instruction Set: Quick Reference](../avm-isa-quick-reference.md)
