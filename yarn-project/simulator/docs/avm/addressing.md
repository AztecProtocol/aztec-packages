# Addressing

## Addressing Modes

The AVM supports three addressing modes that determine how memory offsets/addresses in instructions are resolved to their final memory addresses. Each instruction can use a mix of addressing modes for different operands.


### Direct Addressing

Direct addressing uses the memory offset value directly as specified in the instruction.

**Notation**: `M[x]`

**Example**: If an instruction specifies offset `100`, the VM reads or writes memory at address `100` (`M[100]`).

### Indirect Addressing

Indirect addressing treats the memory offset as a pointer to another memory location that contains the actual address.

**Notation**: `M[M[x]]`

**Example**: If an instruction specifies offset `100` with indirect addressing, the VM:
1. Reads the value at memory address `100` (reads `M[100]` and gets `250`)
2. Uses that value as the actual memory address (reads/writes to `M[250]`)

### Relative Addressing

Relative addressing adds the memory offset to the value stored at memory address `0` (the base pointer).

**Notation**: `M[x + M[0]]`

**Example**: If memory address `0` contains `1000` and an instruction specifies offset `50` with relative addressing:
1. The VM reads `M[0]` (e.g., `1000`)
2. Adds the offset: `50 + 1000 = 1050`
3. Uses `1050` as the actual memory address (reads/writes to `M[1050]`)

### Addressing Mode Bitmask

Each instruction encodes its addressing modes in a bitmask where each bit corresponds to one memory offset operand. The bitmask determines which addressing mode applies to each operand.

#### Bitmask Encoding

Each of an instruction's memory-offset operands uses **2 bits** in the addressing mode bitmask:

| Bits | Mode |
|------|------|
| `00` | Direct |
| `01` | Indirect |
| `10` | Relative |
| `11` | Indirect _and_ relative |

#### Reading the Bitmask

Operands are encoded from **right to left** (least significant bits first):
- Bits 0-1: First memory offset operand's addressing mode
- Bits 2-3: Second memory offset operand's addressing mode
- Bits 4-5: Third memory offset operand's addressing mode
- And so on...

**Example**: For an instruction with 3 memory-offset operands:
- Bitmask `0x06` (hex) = `000110` (binary)
  - First memory offset operand (bits 0-1 = `10`): Relative
  - Second memory offset operand (bits 2-3 = `01`): Indirect
  - Third memory offset operand (bits 4-5 = `00`): Direct

### Gas Cost Considerations

Each memory offset operand that uses non-direct addressing mode(s) incurs additional L2 gas costs:

- **Direct**: No additional cost
- **Indirect**: 3 L2 gas per operand
- **Relative**: 3 L2 gas per operand

These costs are charged **before** operands are resolved, based on the addressing mode bitmask. If a memory offset operand is flagged as _both_ indirect _and_ relative via the bitmask, 6 additional L2 gas is charged for that operand's addressing.

