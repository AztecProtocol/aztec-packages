# Types and Tagged Memory

## Terminology/legend
- `M[X]`: main memory cell at offset `X`
- `tag`: a value referring to a memory cell's type (its maximum potential value)
- `T[X]`: the tag associated with memory cell at offset `X`
- `in-tag`: an instruction's tag to check input operands against. Present for many but not all instructions.
- `dst-tag`: the target type of a `CAST` instruction, also used to tag the destination memory cell
- `ADD<X>`: shorthand for an `ADD` instruction with `in-tag = X`
- `ADD<X> aOffset bOffset dstOffset`: an full `ADD` instruction with `in-tag = X`. See [here](./InstructionSet#isa-section-add) for more details.
- `CAST<X>`: a `CAST` instruction with `dst-tag`: `X`. `CAST` is the only instruction with a `dst-tag`. See [here](./InstructionSet#isa-section-cast) for more details.

## Tags and tagged memory

A `tag` refers to the maximum potential value of a cell of main memory. The following tags are supported:

| tag value | maximum memory cell value | shorthand     |
| --------- | ------------------------- | ------------- |
| 0         | 0                         | uninitialized |
| 1         | $2^8 - 1$                 | `u8`          |
| 2         | $2^{16} - 1$              | `u16`         |
| 3         | $2^{24} - 1$              | `u24`         |
| 4         | $2^{32} - 1$              | `u32`         |
| 5         | $2^{64} - 1$              | `u64`         |
| 6         | $2^{128} - 1$             | `u128`        |
| 7         | $p - 1$                   | `field`       |

> Note: $p$ describes the modulus of the finite field that the AVM circuit is defined over (i.e. number of points on the BN254 curve).
> Note: `u24` is used for offsets into the VM's 24-bit addressable main memory

The purpose of a tag is to inform the VM of the maximum possible length of an operand value that has been loaded from memory.

### Checking input operand tags

Many AVM instructions explicitly operate over range-constrained input parameters (e.g. `ADD<in-tag>`). The maximum allowable value for an instruction's input parameters is defined via an `in-tag` (instruction/input tag). Two potential scenarios result:

1. A VM instruction's tag value matches the input parameter tag values
2. A VM instruction's tag value does _not_ match the input parameter tag values

If case 2 is triggered, an error flag is raised and the current call's execution reverts.

### Writing into memory

It is required that all VM instructions that write into main memory explicitly define the tag of the destination value and ensure the value is appropriately constrained to be consistent with the assigned tag. You can see an instruction's "**Tag updates**" in its section of the instruction set document (see [here for `ADD`](./InstructionSet#isa-section-add) and [here for `CAST`](./InstructionSet#isa-section-cast)).

### Standard tagging example: `ADD`

```
# ADD<u32> aOffset bOffset dstOffset
assert T[aOffset] == T[bOffset] == u32 // check inputs against in-tag, revert on mismatch
T[dstOffset] = u32                     // tag destination with in-tag
M[dstOffset] = M[aOffset] + M[bOffset] // perform the addition
```

### `MOV` and tag preservation

The `MOV` instruction copies data from one memory cell to another, preserving tags. In other words, the destination cell's tag will adopt the value of the source:
```
# MOV srcOffset dstOffset
T[dstOffset] = T[srcOffset] // preserve tag
M[dstOffset] = M[srcOffset] // perform the move
```

Note that `MOV` does not have an `in-tag` and therefore does not need to make any assertions regarding the source memory cell's type.

### `CAST` and tag conversions

The only VM instruction that can be used to cast between tags is `CAST`. Two potential scenarios result:

1. The destination tag describes a maximum value that is _less than_ the source tag
2. The destination tag describes a maximum value that is _greater than or equal to_ the source tag

For Case 1, range constraints must be applied to ensure the destination value is consistent with the source value after tag truncations have been applied.

Case 2 is trivial as no additional consistency checks must be performed between source and destination values.

```
# CAST<u64> srcOffset dstOffset
T[dstOffset] = u64                         // tag destination with dst-tag
M[dstOffset] = cast<to: u64>(M[srcOffset]) // perform cast
```

### Indirect `MOV` and extra tag checks

A `MOV` instruction may flag its source and/or destination offsets as "indirect". An indirect memory access performs `M[M[offset]]` instead of the standard `M[offset]`. Memory offsets must be `u24`s since main memory is a 24-bit addressable space, and so indirect memory accesses include additional checks.

Additional checks for a `MOV` with an indirect source offset:
```
# MOV srcOffset dstOffset      // with indirect source
assert T[srcOffset] == u24     // enforce that `M[srcOffset]` is itself a valid memory offset
T[dstOffset] = T[T[srcOffset]] // tag destination to match indirect source tag
M[dstOffset] = M[M[srcOffset]] // perform move from indirect source
```

Additional checks for a `MOV` with an indirect destination offset:
```
# MOV srcOffset dstOffset      // with indirect destination
assert T[dstOffset] == u24     // enforce that `M[dstOffset]` is itself a valid memory offset
T[T[dstOffset]] = T[srcOffset] // tag indirect destination to match source tag
M[M[dstOffset]] = M[srcOffset] // perform move to indirect destination
```

Additional checks for a `MOV` with both indirect source and destination offsets:
```
# MOV srcOffset dstOffset                  // with indirect source and destination
assert T[srcOffset] == T[dstOffset] == u24 // enforce that `M[*Offset]` are valid memory offsets
T[T[dstOffset]] = T[T[srcOffset]]          // tag indirect destination to match indirect source tag
M[M[dstOffset]] = M[M[srcOffset]]          // perform move to indirect destination
```

### Calldata/returndata and tag conversions

All elements in calldata/returndata are implicitly tagged as field elements (i.e. maximum value is $p - 1$). To perform a tag conversion, calldata/returndata must be copied into main memory (via [`CALLDATACOPY`](./InstructionSet#isa-section-calldatacopy) or [`RETURN`'s `offset` and `size`](./InstructionSet#isa-section-return)), followed by an appropriate `CAST` instruction.
```
# Copy calldata to memory and cast a word to u64
CALLDATACOPY cdOffset size offsetA // copy calldata to memory at offsetA
CAST<u64> offsetA dstOffset        // cast first copied word to a u64
```
This would perform the following:
```
# CALLDATACOPY cdOffset size offsetA
T[offsetA:offsetA+size] = field                            // CALLDATACOPY assigns the field tag
M[offsetA:offsetA+size] = calldata[cdOffset:cdOffset+size] // copy calldata to memory
# CAST<u64> offsetA dstOffset
T[offsetA] = u64                                           // CAST assigns a new tag
M[dstOffset] = cast<u64>(offsetA)                          // perform the cast operation
```
