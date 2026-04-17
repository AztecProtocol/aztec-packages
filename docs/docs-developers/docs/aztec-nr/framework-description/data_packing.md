---
title: Data Packing and Serialization
sidebar_position: 7
tags: [contracts, storage, gas, optimization]
description: Understand Serialize, Deserialize, and Packable traits, when each is used, how to write custom packing, and the cost implications.
---

Aztec contracts use two separate encoding schemes to convert structs into `Field` arrays:

| Trait | Purpose | Where used | Can be hand-rolled for efficiency? |
|-------|---------|------------|------------------------------------|
| `Serialize` / `Deserialize` | ABI encoding for function arguments, return values, events | Public dispatch (calldata), oracles, TypeScript interop | No, it must match Noir's intrinsic format |
| `Packable` | Compact encoding for storage and note hashing | `PublicMutable`, `PublicImmutable`, note hashes, storage reads/writes | Yes, this is the main optimization lever |

Understanding the difference matters because using the wrong trait, or missing an opportunity for custom packing, can waste gas, storage slots, and proving time.

## Serialize and Deserialize

`Serialize` and `Deserialize` define how data is encoded when passing arguments to public functions or returning values. They **must follow Noir's intrinsic serialization**: each struct member becomes one or more `Field` values, with no packing or compression.

This is required because when a transaction calls a public function, TypeScript serializes the arguments into an initial witness using Noir's built-in format. If your Noir-side `Serialize` implementation produces a different layout, you get an **arguments hash mismatch** error.

```rust
// Derive is almost always what you want: it matches Noir's intrinsic format
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

### When derives are added for you vs. manually

Aztec's macros only add a derive when the role of the struct strictly requires it. The rest is the developer's responsibility:

| Macro | Auto-derives `Serialize` | Auto-derives `Deserialize` | Auto-derives `Packable` |
|-------|--------------------------|----------------------------|-------------------------|
| `#[event]` | Yes (if not already present) | No | No |
| `#[authorization]` | Yes (if not already present) | No | No |
| `#[note]` | No | No | No (but **requires** `Packable` to be implemented, so you must add `#[derive(Packable)]` yourself) |
| `#[storage]` | No | No | No (field types must implement `Packable` themselves) |
| `#[aztec]` / `#[contract]` | No | No | No |

Implications for the developer:

- **Function argument types** (both `#[public]` and `#[private]`): you must add `#[derive(Serialize, Deserialize)]` yourself.
- **Event types**: `#[event]` covers `Serialize`. You typically do not need `Deserialize` or `Packable` on events.
- **Note types**: place `#[derive(Packable)]` on the struct *before* `#[note]`. The `#[note]` macro will assert that `Packable` is implemented and fail compilation otherwise.
- **Storage struct fields**: every type used inside a state variable (`PublicMutable<T>`, `PublicImmutable<T>`, `DelayedPublicMutable<T>`, notes, etc.) must implement `Packable`. `#[storage]` does not add this for you.

## Packable

`Packable` defines how data is encoded for **storage** and **note hashing**. Unlike `Serialize`, it does not need to match any external format. It only needs to roundtrip correctly (`unpack(pack(x)) == x`). This means you can pack multiple sub-`Field` values into a single `Field`, reducing storage operations and hash inputs.

### Where Packable matters

- **Public storage** ([`PublicMutable`](pathname:///aztec-nr-api/#api_ref_version/noir_aztec/state_vars/struct.PublicMutable), [`PublicImmutable`](pathname:///aztec-nr-api/#api_ref_version/noir_aztec/state_vars/struct.PublicImmutable)): each element in the packed array corresponds to one `SLOAD` or `SSTORE` AVM opcode. Fewer elements means fewer storage operations, reducing both L2 gas and DA costs.
- **Note hashing**: the packed array is fed into the note hash computation. Fewer fields means fewer hash operations, reducing proving time for private functions.
- [`DelayedPublicMutable`](pathname:///aztec-nr-api/#api_ref_version/noir_aztec/state_vars/struct.DelayedPublicMutable): also uses `Packable` for its underlying storage reads/writes.

### Derived vs. manual Packable

When you `#[derive(Packable)]`, the macro assigns **one `Field` per member**, identical to what `Serialize` produces. This is fine for types composed of `Field`-sized elements, but wasteful for types with smaller members like `bool`, `u8`, `u32`, or `u64`.

```rust
// Derived: N = 3 (one Field per member, no packing benefit)
#[derive(Packable)]
struct GameState {
    started: bool,    // 1 bit, but uses 1 whole Field
    round: u32,       // 32 bits, but uses 1 whole Field
    score: u32,       // 32 bits, but uses 1 whole Field
}
```

By manually implementing `Packable`, you can pack all three values into a single `Field`. `N = 1` instead of 3, so every storage read or write uses one `SLOAD`/`SSTORE` instead of three:

#include_code game_state_manual_packable /docs/examples/contracts/packing_example/src/types.nr rust

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
| `Field` | up to 254 (cannot be packed with other values) |
| `AztecAddress` | up to 254 (wraps a `Field`) |

A `Field` element is an integer modulo the BN254 scalar field prime:

```
p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
```

This prime is ~253.58 bits (slightly less than 2^254), so not every 254-bit value is a valid `Field`. To avoid modular wrap-around when packing, keep the sum of all member bit widths **≤ 253 bits**. For example, `u128 + u64 + u32 = 224 bits` packs safely, but `2 × u128 = 256 bits` does not.

### Step 2: Pack by multiplying with powers of 2

Multiplying by `2.pow_32(k)` shifts a value left by `k` bits. Add the shifted values together to concatenate them inside a single `Field`:

#include_code game_state_pack /docs/examples/contracts/packing_example/src/types.nr rust

The bit layout you choose is arbitrary, the only requirement is that `pack` and `unpack` agree on it. The example above places `score` (a `u32`) at the lowest bits because a truncating cast (`packed[0] as u32`) then extracts it for free, with no subtraction or division. When you have a member whose width matches a standard `uN` type, putting it in the lowest position makes `unpack` cleaner. The remaining members can be placed in any order above it.

### Step 3: Unpack by extracting from lowest bits upward

Extract values from lowest bits first, subtracting each extracted value before extracting the next:

#include_code game_state_unpack /docs/examples/contracts/packing_example/src/types.nr rust

### Step 4: Write roundtrip tests

Always test that `unpack(pack(x)) == x` for boundary values:

#include_code game_state_tests /docs/examples/contracts/packing_example/src/types.nr rust

## Examples

### Derived Packable (Field-sized members)

When all struct members are already `Field`-sized, `#[derive(Packable)]` is all you need. This is the common case for events, storage configs, and note types whose fields are `Field` or `AztecAddress`:

#include_code derived_packable /docs/examples/contracts/packing_example/src/types.nr rust

### Packing two u32 values into one Field

#include_code card_custom_packable /docs/examples/contracts/packing_example/src/types.nr rust

With derived `Packable`, `Card` would have `N = 2`. The manual implementation achieves `N = 1`, halving the storage cost.

### Packing mixed-width integers

#include_code mixed_width_packable /docs/examples/contracts/packing_example/src/types.nr rust

Here a `u128` and a `u64` are packed into a single `Field` (128 + 64 = 192 bits, well within the 253-bit safe limit), while the `AztecAddress` occupies a full `Field` on its own. This reduces `N` from 3 to 2.

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

Note hashes are computed with Poseidon2 over the packed note data along with the storage slot, owner, and randomness. Fewer packed fields means fewer inputs to the hash, which directly reduces the gate count of private functions.

### Calldata (function arguments)

Function arguments use `Serialize`, not `Packable`. The number of fields in calldata affects L2 gas for deserialization. While you cannot change the encoding format (it must match TypeScript), you can reduce calldata size by restructuring your function signatures to pass fewer, larger arguments.

## When to use custom packing

Custom packing is worth the effort when:

- Your struct has **multiple sub-Field members** (bools, small integers) stored in `PublicMutable` or used in notes.
- The struct is **read or written frequently** (for example, game state updated every turn).
- You are hitting **gas limits** due to storage-heavy transactions.

Custom packing is not needed when:

- All struct members are `Field` or `AztecAddress` (already one Field each, no packing opportunity).
- The struct is used only as a function argument (must use `Serialize`, not `Packable`).
- The struct is small and accessed rarely.

## Summary

- Use `#[derive(Serialize, Deserialize)]` for function arguments and events. Never hand-roll these.
- Use `#[derive(Packable)]` as a starting point for storage types and notes. For notes, the `#[note]` macro requires `Packable` and will not add it for you.
- When a struct has multiple sub-`Field` members and is accessed frequently, manually implement `Packable` to pack values together using `2.pow_32()` bit-shifting.
- Keep the total packed bit width at or below 253 bits to stay within the BN254 field modulus.
- Always write roundtrip tests (`unpack(pack(x)) == x`) for custom implementations.
- The gas savings scale linearly with the reduction in `N`: halving `N` halves your storage operations.
