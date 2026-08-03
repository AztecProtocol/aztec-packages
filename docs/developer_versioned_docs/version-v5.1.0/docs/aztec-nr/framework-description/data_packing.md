---
title: Data Packing and Serialization
sidebar_position: 7
tags: [contracts, storage, gas, optimization]
description: Understand Serialize, Deserialize, and Packable traits, when each is used, how to write custom packing, and the cost implications.
---

Aztec contracts use two separate encoding schemes to convert structs into `Field` arrays. This page tells you which one to reach for and when.

- **`Serialize` / `Deserialize`**: ABI encoding. Used anywhere a value crosses the contract boundary (function arguments, return values, events). The layout must match Noir's intrinsic format, so you almost never hand-roll it.
- **`Packable`**: Storage encoding. Used wherever data is written to state or hashed into notes. The format is internal to your contract, so you can pack multiple small values into a single `Field` to save gas and proving time.

Picking the wrong trait, or missing a chance to pack, can waste gas, storage slots, and proving time.

## When to use Serialize and Deserialize

`Deserialize` is needed for any struct accepted as a function argument; `Serialize` is needed for any struct returned from a function or emitted as an event. Because args and returns often share the same struct, `#[derive(Serialize, Deserialize)]` is the convenient default.

The encoding must follow Noir's intrinsic serialization: each struct member becomes one or more `Field` values, with no packing or compression. When a transaction calls a public function, TypeScript serializes the arguments into an initial witness using Noir's built-in format. If your Noir-side implementation produces a different layout, you get an "arguments hash mismatch" error.

```rust
// Matches Noir's intrinsic format automatically.
#[derive(Serialize, Deserialize)]
struct MyArgs {
    amount: u128,    // 1 Field
    enabled: bool,   // 1 Field
    owner: Field,    // 1 Field
}
// Serialize::N = 3 (one Field per member)
```

For events, `#[event]` auto-derives `Serialize` for you. You typically do not need `Deserialize` or `Packable` on events.

:::warning
Do not hand-roll `Serialize` or `Deserialize` for types passed as function arguments. The encoding must match what TypeScript sends, and the derive macro ensures this automatically.
:::

## When to use Packable

Use `Packable` for note `structs` when creating custom notes or as the data type of a state variable (`PublicMutable<T>`, `PublicImmutable<T>`, `DelayedPublicMutable<T>`). `Packable` defines how the value is encoded when written to storage or hashed into a note. It never needs to match any external format; it only needs to roundtrip: `unpack(pack(x)) == x`.

There are two cases.

### Case 1: a custom note

`#[note]` _requires_ the struct to implement `Packable` but does **not** add it for you. Place `#[derive(Packable)]` on the struct before applying `#[note]`, or the macro will fail compilation with an explicit message.

When a note's members are already `Field`-sized, deriving is enough:

```rust title="field_like_note" showLineNumbers 
// A note whose members are already Field-sized.
// #[note] requires Packable; derive is sufficient here -- N = 1.
#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct OwnerNote {
    pub owner: AztecAddress,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.1.0/docs/examples/contracts/packing_example/src/types.nr#L20-L28" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/packing_example/src/types.nr#L20-L28</a></sub></sup>


`Eq` is a Noir standard trait for equality comparisons (see [Noir's `Eq` trait](https://noir-lang.org/docs/noir/concepts/data_types/traits)). `#[note]` does not require it, but deriving it is idiomatic because it enables `assert_eq` in tests and note-equality checks. `Serialize` and `Deserialize` are similarly optional here, and useful when a note type crosses a function boundary.

This is how the built-in note types work too: [`AddressNote`](pathname:///aztec-nr-api/mainnet/address_note/struct.AddressNote) and [`FieldNote`](pathname:///aztec-nr-api/mainnet/field_note/struct.FieldNote) both derive `Packable` directly because their members are already `Field` or `AztecAddress`.

When a note has members smaller than a `Field` (`bool`, `u8`, `u32`, `u64`), you can skip the `Packable` derive and write a custom implementation that packs multiple values into a single `Field`:

```rust title="card_note" showLineNumbers 
// A note with two u32 members. Derived Packable would give N = 2;
// a custom impl halves that to N = 1, reducing note-hash inputs.
#[derive(Eq)]
#[note]
pub struct CardNote {
    pub strength: u32,
    pub points: u32,
}

impl Packable for CardNote {
    let N: u32 = 1;

    fn pack(self) -> [Field; Self::N] {
        [(self.strength as Field) * 2.pow_32(32) + (self.points as Field)]
    }

    fn unpack(packed: [Field; Self::N]) -> Self {
        let points = packed[0] as u32;
        let strength = ((packed[0] - points as Field) / 2.pow_32(32)) as u32;
        Self { strength, points }
    }
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.1.0/docs/examples/contracts/packing_example/src/types.nr#L30-L53" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/packing_example/src/types.nr#L30-L53</a></sub></sup>


Derived `Packable` would give `CardNote` an `N = 2`; the custom impl halves that to `N = 1`. Smaller `N` means fewer inputs to the note hash, which directly reduces the gate count of private functions.

### Case 2: a struct used as a state variable's data type

Primitive types (`bool`, `u8` through `u128`, `Field`, `AztecAddress`) already implement `Packable`, so `PublicMutable<u64>` or `PublicImmutable<AztecAddress>` works out of the box. This section applies when the data type is a user-defined struct, for example `PublicMutable<MyStruct, Context>`.

`#[storage]` requires every state variable's data type to implement `Packable`, but it does not add it for you. Put `#[derive(Packable)]` on the struct yourself.

:::note
`PublicImmutable<T>` and `DelayedPublicMutable<T>` also require `T: Eq`, because they verify stored values against a hash. Add `Eq` to the derive list (`#[derive(Eq, Packable)]`) for structs used in these state variables. `PublicMutable<T>` only needs `Packable`.
:::

When all members are already `Field`-sized (`Field`, `AztecAddress`, and types built from them), deriving is sufficient:

```rust title="derived_packable" showLineNumbers 
// When all members are Field-sized, derive(Packable) is sufficient.
// Each member gets its own Field -- no packing benefit, but no manual work needed.
#[derive(Eq, Packable, Serialize)]
pub struct ServerConfig {
    pub admin: AztecAddress,
    pub token: AztecAddress,
    pub max_supply: Field,
}
// N = 3 (one Field per member)
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.1.0/docs/examples/contracts/packing_example/src/types.nr#L8-L18" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/packing_example/src/types.nr#L8-L18</a></sub></sup>


For [`PublicMutable<T>`](pathname:///aztec-nr-api/mainnet/noir_aztec/state_vars/struct.PublicMutable), each element of the packed `[Field; N]` array maps directly to one `SLOAD` on read and one `SSTORE` on write, so a smaller `N` is a direct gas saving. [`PublicImmutable<T>`](pathname:///aztec-nr-api/mainnet/noir_aztec/state_vars/struct.PublicImmutable) and [`DelayedPublicMutable<T>`](pathname:///aztec-nr-api/mainnet/noir_aztec/state_vars/struct.DelayedPublicMutable) have additional overhead on top (see [Cost impact](#cost-impact) below), but also benefit from a smaller `N`.

When your struct has members smaller than a `Field`, deriving still uses one whole `Field` per member, which is wasteful. The next section shows how to write a manual implementation that collapses them.

## Writing a custom Packable implementation

The technique is bit-packing with powers of 2, which maps efficiently to both AVM opcodes (public functions) and proving-backend primitives (private functions).

Take a `GameState` struct with a `bool` and two `u32`s. Derived `Packable` gives `N = 3`. A manual implementation collapses it to `N = 1`:

```rust
// Derived: N = 3 (one Field per member, no packing benefit)
#[derive(Packable)]
struct GameState {
    started: bool,    // 1 bit, but uses 1 whole Field
    round: u32,       // 32 bits, but uses 1 whole Field
    score: u32,       // 32 bits, but uses 1 whole Field
}
```

```rust title="game_state_manual_packable" showLineNumbers 
// Mixed-width with a bool: started (1 bit) + round (32 bits) + score (32 bits).
// Derived Packable would give N = 3; manual packing gives N = 1.
#[derive(Eq, Serialize)]
pub struct GameState {
    pub started: bool,
    pub round: u32,
    pub score: u32,
}

impl Packable for GameState {
    let N: u32 = 1;

    fn pack(self) -> [Field; Self::N] {
        // Layout within a single Field:
        // [ started (1 bit) | round (32 bits) | score (32 bits) ]
        //   bit 64            bits 32..63       bits 0..31
        [
            (self.started as Field) * 2.pow_32(64) // shift left by 64 bits
                + (self.round as Field) * 2.pow_32(32) // shift left by 32 bits
                + (self.score as Field), // lowest bits
        ]
    }

    fn unpack(packed: [Field; Self::N]) -> Self {
        // 1. Extract lowest value via truncating cast
        let score = packed[0] as u32;

        // 2. Subtract and shift right to get next value
        let round = ((packed[0] - score as Field) / 2.pow_32(32)) as u32;

        // 3. Subtract and shift right to get highest value.
        //    Bools are extracted by comparing the resulting Field to 0.
        let started = ((packed[0] - score as Field - (round as Field) * 2.pow_32(32))
            / 2.pow_32(64))
            != 0;

        Self { started, round, score }
    }
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.1.0/docs/examples/contracts/packing_example/src/types.nr#L112-L156" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/packing_example/src/types.nr#L112-L156</a></sub></sup>


`N = 1` means every storage read or write uses one `SLOAD` / `SSTORE` instead of three. The rest of this section walks through how the implementation was built.

### Step 1: Determine bit widths

For each member, determine how many bits it needs:

| Type           | Bit width                                      |
| -------------- | ---------------------------------------------- |
| `bool`         | 1                                              |
| `u8`           | 8                                              |
| `u16`          | 16                                             |
| `u32`          | 32                                             |
| `u64`          | 64                                             |
| `u128`         | 128                                            |
| `Field`        | up to 254 (cannot be packed with other values) |
| `AztecAddress` | up to 254 (wraps a `Field`)                    |

A `Field` element is an integer modulo the BN254 scalar field prime:

```
p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
```

This prime is ~253.58 bits (slightly less than 2^254), so not every 254-bit value is a valid `Field`. To avoid modular wrap-around when packing, keep the sum of all member bit widths **≤ 253 bits**. For example, `u128 + u64 + u32 = 224 bits` packs safely, but `2 × u128 = 256 bits` does not.

### Step 2: Pack by multiplying with powers of 2

`2.pow_32(k)` computes `2^k`, which is equivalent to a left shift by `k` bits for integer-valued `Field`s. Add the shifted values together to concatenate them inside a single `Field`:

```rust title="game_state_pack" showLineNumbers 
fn pack(self) -> [Field; Self::N] {
    // Layout within a single Field:
    // [ started (1 bit) | round (32 bits) | score (32 bits) ]
    //   bit 64            bits 32..63       bits 0..31
    [
        (self.started as Field) * 2.pow_32(64) // shift left by 64 bits
            + (self.round as Field) * 2.pow_32(32) // shift left by 32 bits
            + (self.score as Field), // lowest bits
    ]
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.1.0/docs/examples/contracts/packing_example/src/types.nr#L125-L136" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/packing_example/src/types.nr#L125-L136</a></sub></sup>


The bit layout you choose is arbitrary; the only requirement is that `pack` and `unpack` agree. The example above places `score` (a `u32`) at the lowest bits because a truncating cast (`packed[0] as u32`) then extracts it for free, with no subtraction or division. When you have a member whose width matches a standard `uN` type, putting it in the lowest position makes `unpack` cleaner. The remaining members can be placed in any order above it.

### Step 3: Unpack by extracting from lowest bits upward

Extract values from lowest bits first, to match how we packed them, subtracting each extracted value before extracting the next:

```rust title="game_state_unpack" showLineNumbers 
fn unpack(packed: [Field; Self::N]) -> Self {
    // 1. Extract lowest value via truncating cast
    let score = packed[0] as u32;

    // 2. Subtract and shift right to get next value
    let round = ((packed[0] - score as Field) / 2.pow_32(32)) as u32;

    // 3. Subtract and shift right to get highest value.
    //    Bools are extracted by comparing the resulting Field to 0.
    let started = ((packed[0] - score as Field - (round as Field) * 2.pow_32(32))
        / 2.pow_32(64))
        != 0;

    Self { started, round, score }
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.1.0/docs/examples/contracts/packing_example/src/types.nr#L138-L154" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/packing_example/src/types.nr#L138-L154</a></sub></sup>


### Step 4: Write roundtrip tests

Always test that `unpack(pack(x)) == x` for boundary values:

```rust title="game_state_tests" showLineNumbers 
#[test]
fn test_game_state_pack_unpack() {
    let state = GameState { started: true, round: 42, score: 1000 };
    let unpacked = GameState::unpack(state.pack());
    assert_eq(unpacked.started, state.started);
    assert_eq(unpacked.round, state.round);
    assert_eq(unpacked.score, state.score);
}

#[test]
fn test_game_state_pack_unpack_max() {
    let state =
        GameState { started: true, round: 0xffffffff, score: 0xffffffff };
    let unpacked = GameState::unpack(state.pack());
    assert_eq(unpacked.started, state.started);
    assert_eq(unpacked.round, state.round);
    assert_eq(unpacked.score, state.score);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.1.0/docs/examples/contracts/packing_example/src/types.nr#L204-L223" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/packing_example/src/types.nr#L204-L223</a></sub></sup>


## More custom Packable examples

### Packing two u32 values into one Field

```rust title="card_custom_packable" showLineNumbers 
// Two u32 values packed into a single Field.
// Derived Packable would give N = 2; manual packing gives N = 1.
#[derive(Deserialize, Eq, Serialize)]
pub struct Card {
    pub strength: u32,
    pub points: u32,
}

impl Packable for Card {
    let N: u32 = 1;

    fn pack(self) -> [Field; Self::N] {
        [(self.strength as Field) * 2.pow_32(32) + (self.points as Field)]
    }

    fn unpack(packed: [Field; Self::N]) -> Self {
        let points = packed[0] as u32;
        let strength = ((packed[0] - points as Field) / 2.pow_32(32)) as u32;
        Self { strength, points }
    }
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.1.0/docs/examples/contracts/packing_example/src/types.nr#L55-L77" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/packing_example/src/types.nr#L55-L77</a></sub></sup>


With derived `Packable`, `Card` would have `N = 2`. The manual implementation achieves `N = 1`, halving the storage cost.

### Packing mixed-width integers

```rust title="mixed_width_packable" showLineNumbers 
// Mixed-width integers: a u128 and a u64 packed into one Field,
// plus an AztecAddress that takes a full Field on its own.
// Derived Packable would give N = 3; manual packing gives N = 2.
#[derive(Eq, Serialize)]
pub struct GameConfig {
    pub interest_accumulator: u128,
    pub last_updated_ts: u64,
    pub admin: AztecAddress,
}

impl Packable for GameConfig {
    let N: u32 = 2;

    fn pack(self) -> [Field; Self::N] {
        [
            // u128 (128 bits) + u64 (64 bits) = 192 bits, fits in one Field
            (self.interest_accumulator as Field) * 2.pow_32(64)
                + (self.last_updated_ts as Field),
            self.admin.to_field(),
        ]
    }

    fn unpack(packed: [Field; Self::N]) -> Self {
        let last_updated_ts = packed[0] as u64;
        let interest_accumulator =
            ((packed[0] - last_updated_ts as Field) / 2.pow_32(64)) as u128;
        let admin = AztecAddress::from_field(packed[1]);
        Self { interest_accumulator, last_updated_ts, admin }
    }
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.1.0/docs/examples/contracts/packing_example/src/types.nr#L79-L110" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/packing_example/src/types.nr#L79-L110</a></sub></sup>


A `u128` and a `u64` pack into a single `Field` (128 + 64 = 192 bits, well within the 253-bit safe limit), while the `AztecAddress` occupies a full `Field` on its own. This reduces `N` from 3 to 2.

### Roundtrip tests

Always test custom `Packable` implementations at boundary values:

```rust title="pack_unpack_tests" showLineNumbers 
mod test {
    use super::{AztecAddress, Card, FromField, GameConfig, GameState, Packable};

    #[test]
    fn test_card_pack_unpack() {
        let card = Card { strength: 42, points: 100 };
        let unpacked = Card::unpack(card.pack());
        assert_eq(unpacked.strength, card.strength);
        assert_eq(unpacked.points, card.points);
    }

    #[test]
    fn test_card_pack_unpack_max() {
        let card = Card { strength: 0xffffffff, points: 0xffffffff };
        let unpacked = Card::unpack(card.pack());
        assert_eq(unpacked.strength, card.strength);
        assert_eq(unpacked.points, card.points);
    }

    #[test]
    fn test_config_pack_unpack() {
        let config = GameConfig {
            interest_accumulator: 1000000,
            last_updated_ts: 1700000000,
            admin: AztecAddress::from_field(0xabcdef),
        };
        let unpacked = GameConfig::unpack(config.pack());
        assert_eq(unpacked.interest_accumulator, config.interest_accumulator);
        assert_eq(unpacked.last_updated_ts, config.last_updated_ts);
        assert(unpacked.admin.eq(config.admin));
    }

    #[test]
    fn test_config_pack_unpack_max() {
        let config = GameConfig {
            interest_accumulator: 0xffffffffffffffffffffffffffffffff,
            last_updated_ts: 0xffffffffffffffff,
            admin: AztecAddress::from_field(0xabcdef),
        };
        let unpacked = GameConfig::unpack(config.pack());
        assert_eq(unpacked.interest_accumulator, config.interest_accumulator);
        assert_eq(unpacked.last_updated_ts, config.last_updated_ts);
        assert(unpacked.admin.eq(config.admin));
    }

    #[test]
    fn test_game_state_pack_unpack() {
        let state = GameState { started: true, round: 42, score: 1000 };
        let unpacked = GameState::unpack(state.pack());
        assert_eq(unpacked.started, state.started);
        assert_eq(unpacked.round, state.round);
        assert_eq(unpacked.score, state.score);
    }

    #[test]
    fn test_game_state_pack_unpack_max() {
        let state =
            GameState { started: true, round: 0xffffffff, score: 0xffffffff };
        let unpacked = GameState::unpack(state.pack());
        assert_eq(unpacked.started, state.started);
        assert_eq(unpacked.round, state.round);
        assert_eq(unpacked.score, state.score);
    }
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.1.0/docs/examples/contracts/packing_example/src/types.nr#L158-L225" target="_blank" rel="noopener noreferrer">Source code: docs/examples/contracts/packing_example/src/types.nr#L158-L225</a></sub></sup>


## Cost impact

### Public storage

Each state variable type has a different storage-op profile, but all of them scale with `N`, the length of the packed `[Field; N]` array for the data type `T`. Reducing `N` reduces cost for every type.

If a struct has `Packable::N = 4` with derived packing but could be manually packed to `N = 2`, you halve the public `SLOAD` / `SSTORE` count on every read and write.

### Note hashing (private state)

Note hashes are computed with Poseidon2 over the packed note data along with the storage slot, owner, and randomness. Fewer packed fields means fewer inputs to the hash, which directly reduces the gate count of private functions.

### Calldata (function arguments)

Function arguments use `Serialize`, not `Packable`. The number of fields in calldata affects L2 gas for deserialization. While you cannot change the encoding format (it must match TypeScript), you can reduce calldata size by restructuring your function signatures to pass fewer, larger arguments.

## When is custom packing worth it?

Custom packing is worth the effort when:

- Your struct has **multiple sub-Field members** (bools, small integers) stored in a state variable or used in notes.
- The struct is **read or written frequently** (for example, game state updated every turn).
- You are hitting **gas limits** due to storage-heavy transactions.

Custom packing is not needed when:

- All struct members are `Field` or `AztecAddress` (already one Field each, no packing opportunity).
- The struct is used only as a function argument (must use `Serialize`, not `Packable`).
- The struct is small and accessed rarely.

## Reference: which macros auto-derive which traits

Aztec's macros only add a derive when the role of the struct strictly requires it. Everything else is on the developer.

| Macro                      | Auto-derives `Serialize`     | Auto-derives `Deserialize` | Auto-derives `Packable`                                                                   |
| -------------------------- | ---------------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| `#[event]`                 | Yes (if not already present) | No                         | No                                                                                        |
| `#[authorization]`         | Yes (if not already present) | No                         | No                                                                                        |
| `#[note]`                  | No                           | No                         | No (but **requires** `Packable` to be implemented; the macro fails compilation otherwise) |
| `#[storage]`               | No                           | No                         | No (state variable data types must implement `Packable` themselves)                       |
| `#[aztec]` / `#[contract]` | No                           | No                         | No                                                                                        |

Implications:

- **Function argument types** (both `#[public]` and `#[private]`): add `#[derive(Serialize, Deserialize)]` yourself.
- **Event types**: `#[event]` covers `Serialize`. You typically do not need `Deserialize` or `Packable` on events.
- **Note types**: place `#[derive(Packable)]` on the struct _before_ `#[note]`, unless you are providing a manual `impl Packable`.
- **State variable data types**: every type used inside `PublicMutable<T>`, `PublicImmutable<T>`, `DelayedPublicMutable<T>`, notes, etc. must implement `Packable`. `#[storage]` does not add this for you.

## Summary

- Use `#[derive(Serialize, Deserialize)]` for function arguments and return values. `#[event]` handles events.
- Use `#[derive(Packable)]` (or a manual impl) for note structs and state variable data types. `#[note]` requires `Packable` and will not add it for you.
- When a struct has multiple sub-`Field` members and is accessed frequently, manually implement `Packable` to pack values together using `2.pow_32()`.
- Keep the total packed bit width at or below 253 bits to stay within the BN254 field modulus.
- Always write roundtrip tests (`unpack(pack(x)) == x`) for custom implementations.
- Gas savings scale linearly with the reduction in `N`: halving `N` halves your storage operations.
