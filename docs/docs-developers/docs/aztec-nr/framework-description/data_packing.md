---
title: Data Packing and Serialization
sidebar_position: 7
tags: [contracts, storage, gas, optimization]
description: Understand Serialize, Deserialize, and Packable traits — when each is used, how to write custom packing, and the cost implications.
---

Aztec contracts use two separate encoding schemes to convert structs into `Field` arrays:

| Trait | Purpose | Where used | Can be hand-rolled for efficiency? |
|-------|---------|------------|------------------------------------|
| `Serialize` / `Deserialize` | ABI encoding for function arguments, return values, events | Public dispatch (calldata), oracles, TypeScript interop | No — must match Noir's intrinsic format |
| `Packable` | Compact encoding for storage and note hashing | `PublicMutable`, `PublicImmutable`, note hashes, storage reads/writes | Yes — this is the main optimization lever |

Understanding the difference matters because using the wrong trait — or missing an opportunity for custom packing — can waste gas, storage slots, and proving time.

## Serialize and Deserialize

`Serialize` and `Deserialize` define how data is encoded when passing arguments to public functions or returning values. They **must follow Noir's intrinsic serialization**: each struct member becomes one or more `Field` values, with no packing or compression.

This is required because when a transaction calls a public function, TypeScript serializes the arguments into an initial witness using Noir's built-in format. If your Noir-side `Serialize` implementation produces a different layout, you get an **arguments hash mismatch** error.

```rust
// Derive is almost always what you want — it matches Noir's intrinsic format
#[derive(Serialize, Deserialize)]
struct MyArgs {
    amount: u128,    // 1 Field
    enabled: bool,   // 1 Field
    owner: Field,    // 1 Field
}
// Serialize::N = 3 (one Field per member)
```

:::warning
Do not hand-roll `Serialize` or `Deserialize` for types passed as function arguments. The encoding must match what TypeScript sends, and the derive macro ensures this automatically.
:::

## Packable

`Packable` defines how data is encoded for **storage** and **note hashing**. Unlike `Serialize`, it does not need to match any external format — it only needs to roundtrip correctly (`unpack(pack(x)) == x`). This means you can pack multiple sub-`Field` values into a single `Field`, reducing storage operations and hash inputs.

### Where Packable matters

- **Public storage** (`PublicMutable`, `PublicImmutable`): Each element in the packed array corresponds to one `SLOAD` or `SSTORE` AVM opcode. Fewer elements means fewer storage operations, reducing both L2 gas and DA costs.
- **Note hashing**: The packed array is fed into the note hash computation. Fewer fields means fewer hash operations, reducing proving time for private functions.
- **`DelayedPublicMutable`**: Also uses `Packable` for its underlying storage reads/writes.

### Derived vs. manual Packable

When you `#[derive(Packable)]`, the macro assigns **one `Field` per member** — identical to what `Serialize` produces. This is fine for types composed of `Field`-sized elements, but wasteful for types with smaller members like `bool`, `u8`, `u32`, or `u64`.

```rust
// Derived: N = 3 (one Field per member — no packing benefit)
#[derive(Packable)]
struct GameState {
    started: bool,    // 1 bit, but uses 1 whole Field
    round: u32,       // 32 bits, but uses 1 whole Field
    score: u32,       // 32 bits, but uses 1 whole Field
}
```

By manually implementing `Packable`, you can pack all three values into a single `Field`:

```rust
impl Packable for GameState {
    let N: u32 = 1;

    fn pack(self) -> [Field; Self::N] {
        [
            (self.started as Field) * 2.pow_32(64)
            + (self.round as Field) * 2.pow_32(32)
            + (self.score as Field)
        ]
    }

    fn unpack(packed: [Field; Self::N]) -> Self {
        let score = packed[0] as u32;
        let round = ((packed[0] - score as Field) / 2.pow_32(32)) as u32;
        let started = ((packed[0] - score as Field - (round as Field) * 2.pow_32(32)) / 2.pow_32(64)) as u1 != 0;
        Self { started, round, score }
    }
}
// N = 1 instead of 3: 3x fewer SLOAD/SSTORE operations
```

## How to write custom Packable implementations

The core technique is **bit-packing with powers of 2**. This maps efficiently to both AVM opcodes (public functions) and proving backend primitives (private functions).

### Step 1: Determine bit widths

For each member, determine how many bits it needs:

| Type | Bit width |
|------|-----------|
| `bool` | 1 |
| `u8` | 8 |
| `u16` | 16 |
| `u32` | 32 |
| `u64` | 64 |
| `u128` | 128 |
| `Field` | ~254 (cannot be packed with other values) |
| `AztecAddress` | ~254 (wraps a `Field`) |

A single `Field` can hold up to 254 bits, but the field modulus is slightly less than 2^254. In practice, keeping the total bit width comfortably below 254 (e.g., 192 bits for a u128 + u64) avoids overflow issues.

### Step 2: Pack by multiplying with powers of 2

Place the **smallest** value in the lowest bits and shift larger values upward:

```rust
// Layout within a single Field:
// [  value_a (128 bits)  |  value_b (64 bits)  |  value_c (32 bits)  ]
//   bits 96..223            bits 32..95            bits 0..31

fn pack(self) -> [Field; 1] {
    [
        (self.value_a as Field) * 2.pow_32(96)     // shift left by 96 bits
        + (self.value_b as Field) * 2.pow_32(32)   // shift left by 32 bits
        + (self.value_c as Field)                   // lowest bits
    ]
}
```

### Step 3: Unpack by extracting from lowest bits upward

Extract values from lowest bits first, subtracting each extracted value before extracting the next:

```rust
fn unpack(packed: [Field; 1]) -> Self {
    // 1. Extract lowest value via truncating cast
    let value_c = packed[0] as u32;

    // 2. Subtract and shift right to get next value
    let value_b = ((packed[0] - value_c as Field) / 2.pow_32(32)) as u64;

    // 3. Subtract and shift right to get highest value
    let value_a = ((packed[0] - value_c as Field - (value_b as Field) * 2.pow_32(32)) / 2.pow_32(96)) as u128;

    Self { value_a, value_b, value_c }
}
```

### Step 4: Write roundtrip tests

Always test that `unpack(pack(x)) == x` for boundary values:

```rust
#[test]
fn test_pack_unpack() {
    let original = MyStruct { value_a: 1000000, value_b: 42, value_c: 0 };
    let unpacked = MyStruct::unpack(original.pack());
    assert_eq(unpacked.value_a, original.value_a);
    assert_eq(unpacked.value_b, original.value_b);
    assert_eq(unpacked.value_c, original.value_c);
}

#[test]
fn test_pack_unpack_max() {
    let original = MyStruct {
        value_a: 0xffffffffffffffffffffffffffffffff, // max u128
        value_b: 0xffffffffffffffff,                 // max u64
        value_c: 0xffffffff,                          // max u32
    };
    let unpacked = MyStruct::unpack(original.pack());
    assert_eq(unpacked.value_a, original.value_a);
    assert_eq(unpacked.value_b, original.value_b);
    assert_eq(unpacked.value_c, original.value_c);
}
```

## Examples

### Derived Packable (Field-sized members)

When all struct members are already `Field`-sized, `#[derive(Packable)]` is all you need:

#include_code derived_packable /docs/examples/contracts/packing_example/src/types.nr rust

### Packing two u32 values into one Field

#include_code card_custom_packable /docs/examples/contracts/packing_example/src/types.nr rust

With derived `Packable`, `Card` would have `N = 2`. The manual implementation achieves `N = 1` — halving the storage cost.

### Packing mixed-width integers

#include_code mixed_width_packable /docs/examples/contracts/packing_example/src/types.nr rust

Here a `u128` and a `u64` are packed into a single `Field` (128 + 64 = 192 bits, well within the ~254-bit limit), while the `AztecAddress` occupies a full `Field` on its own. This reduces `N` from 3 to 2.

### Roundtrip tests

Always test your custom `Packable` implementations at boundary values:

#include_code pack_unpack_tests /docs/examples/contracts/packing_example/src/types.nr rust

## Cost impact

### Public storage

Every element in the `Packable` array maps to one AVM storage opcode:

| Operation | Cost per slot |
|-----------|--------------|
| `SLOAD` (read) | L2 gas |
| `SSTORE` (write) | L2 gas + DA cost |

If a struct has `Packable::N = 4` with derived packing but could be manually packed to `N = 2`, you halve the number of storage operations on every read and write.

### Note hashing (private state)

Note hashes are computed over the packed array concatenated with the owner and randomness. Fewer packed fields means fewer inputs to the Poseidon2 hash, which directly reduces the gate count of private functions.

### Calldata (function arguments)

Function arguments use `Serialize`, not `Packable`. The number of fields in calldata affects L2 gas for deserialization. While you cannot change the encoding format (it must match TypeScript), you can reduce calldata size by restructuring your function signatures to pass fewer, larger arguments.

## When to use custom packing

Custom packing is worth the effort when:

- Your struct has **multiple sub-Field members** (bools, small integers) stored in `PublicMutable` or used in notes
- The struct is **read or written frequently** (e.g., game state updated every turn)
- You are hitting **gas limits** due to storage-heavy transactions

Custom packing is not needed when:

- All struct members are `Field` or `AztecAddress` (already one Field each — no packing opportunity)
- The struct is used only as a function argument (must use `Serialize`, not `Packable`)
- The struct is small and accessed rarely

## Summary

- Use `#[derive(Serialize, Deserialize)]` for function arguments and events — never hand-roll these.
- Use `#[derive(Packable)]` as a starting point for storage types and notes.
- When a struct has multiple sub-`Field` members and is accessed frequently, manually implement `Packable` to pack values together using `2.pow_32()` bit-shifting.
- Always write roundtrip tests (`unpack(pack(x)) == x`) for custom implementations.
- The gas savings scale linearly with the reduction in `N`: halving `N` halves your storage operations.
