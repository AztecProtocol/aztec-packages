# Memory

AVM memory stores the internal state of the current program being executed. It can be written to as well as read.

The AVM uses a **tagged memory model** where each memory cell contains a value (a finite field) and an associated type tag.


## Tagged Memory

Cells in memory are "type-tagged" when they are written. Cells that have never been written before have value 0 and tag `FIELD`.

Some AVM opcodes (see the [Instruction Set](avm-isa-quick-reference.md)) write to memory. Any opcode that writes to memory is responsible for properly tagging written cells and ensuring that written values fit in the associated range.

In other words, values are range-checked when _written_ to memory. This means that when _reading_ a value from memory, it can be safely assumed that the value is within the range specified by its tag.

### Type Tags 

The following type tags are supported in the AVM:

| Tag Name | Tag | Max Value | Modulus |
|----------|-----------|-----------|-------------------|
| `FIELD` | 0 | $p - 1$ | $p$ (BN254 field prime) |
| `UINT1` | 1 | $2^1 - 1$ | $2^1$ |
| `UINT8` | 2 | $2^8 - 1$ | $2^8$ |
| `UINT16` | 3 | $2^{16} - 1$ | $2^{16}$ |
| `UINT32` | 4 | $2^{32} - 1$ | $2^{32}$ |
| `UINT64` | 5 | $2^{64} - 1$ | $2^{64}$ |
| `UINT128` | 6 | $2^{128} - 1$ | $2^{128}$ |

Where $p$ is the BN254 field prime:
```
p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
```

**Notes:**
- `UINT32` is used for offsets into the VM's 32-bit addressable main memory
- All arithmetic operations on integer types are performed modulo $2^k$ where $k$ is the bit-width
- Field operations are performed modulo $p$

## Memory Notation

### Memory Accesses

`M[x]` denotes the value stored in memory at offset `x`. Memory is organized as a linear array of field elements, with each cell capable of holding a value from the BN254 field.

Instructions may resolve operands using [addressing modes](addressing.md#addressing-modes) (direct, indirect, and/or relative) to determine the final memory offset.

### Type Tags

`T[x]` denotes the type tag associated with the memory cell at offset `x`. Type tags specify how the value should be interpreted, what operations are valid, and what modulus applies to arithmetic operations.


## Tag Checking and Updates: The ADD Instruction

Most AVM instructions explicitly check input tags and assign output tags. Here's how the `ADD` instruction demonstrates these principles:

**Instruction:** `ADD aOffset bOffset dstOffset`

**Semantics:**
```javascript
M[dstOffset] = M[aOffset] + M[bOffset]
```

**Tag Checks:**
- Both operands must have matching tags: `T[aOffset] == T[bOffset]`
- If tags don't match, a `TAG_MISMATCH` error is raised and execution reverts

**Tag Updates:**
- The destination inherits the tag from the operands: `T[dstOffset] = T[aOffset]`
- This ensures the result is properly constrained to the same type as the inputs

**Example:**
```
# Before execution
T[100] = UINT32    M[100] = 42
T[200] = UINT32    M[200] = 58
T[300] = <unset>   M[300] = <unset>

# Execute: ADD 100 200 300

# After execution (successful)
T[100] = UINT32    M[100] = 42
T[200] = UINT32    M[200] = 58
T[300] = UINT32    M[300] = 100  # 42 + 58 = 100

# The VM enforced:
# 1. T[100] == T[200] (both UINT32) ✓
# 2. T[300] = T[100] (destination tagged as UINT32)
# 3. Result constrained to fit in UINT32 (already satisfied since inputs are UINT32)
```

**Error Example:**
```
# Before execution
T[100] = UINT32    M[100] = 42
T[200] = UINT64    M[200] = 58

# Execute: ADD 100 200 300

# Result: TAG_MISMATCH error, execution reverts
# T[100] (UINT32) ≠ T[200] (UINT64)
```

## Special Instructions and Tag Handling

### CAST: Tag Conversion

The `CAST` instruction is the only way to convert between type tags:

```
CAST<dstTag> srcOffset dstOffset
T[dstOffset] = dstTag           # Assign new tag
M[dstOffset] = cast<to: dstTag>(M[srcOffset])  # Convert value
```

When casting to a smaller type (e.g., UINT128 → UINT32), the value is truncated. When casting to a larger type, the value is preserved.

## Indirect Memory Access and Tag Requirements

Indirect memory addressing (`M[M[x]]`) requires the pointer cell to be tagged as `UINT32`, since main memory is a 32-bit addressable space.

**Example with indirect MOV:**
```
# MOV srcOffset dstOffset (with indirect source)
assert T[srcOffset] == UINT32     # Pointer must be UINT32
T[dstOffset] = T[M[srcOffset]]    # Tag destination to match indirect source tag
M[dstOffset] = M[M[srcOffset]]    # Perform move from indirect source
```

## Memory Bounds

An out-of-bounds memory access can be encountered when:
- An instruction operand uses relative addressing which derives a memory offset from the addition of two values (see [Addressing](addressing.md)).
- An instruction operates on a _range_ of data (see [EMITUNENCRYPTEDLOG](opcodes/emitunencryptedlog.md))

When this happens, the instruction will throw an error **MEMORY_ACCESS_OUT_OF_RANGE**.

---
← Previous: [State](./state.md) | Next: [Addressing Modes](./addressing.md) →
