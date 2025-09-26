---
title: Note Types
tags: [contracts, notes]
sidebar_position: 3
keywords: [implementing note, note]
description: Learn about note types and how to implement custom note types in your Aztec smart contracts.
---

Notes are the fundamental data structure in Aztec when working with private state. Using Aztec.nr, developers can define note types which allow flexibility in how notes are stored and nullified.

You may want to create your own note type if you need to use a specific type of private data or struct that is not already implemented in Aztec.nr, or if you want to experiment with custom note hashing and nullifier schemes. For custom hashing and nullifier schemes, use the `#[custom_note]` macro instead of `#[note]`, as it does not automatically derive the `NoteHash` trait.

For example, if you are developing a card game, you may want to store multiple pieces of data in each card. Rather than storing each piece of data in its own note, you can define a card note type that contains all the data, and then nullify (or exchange ownership of) the card when it has been used.

If you want to work with values, addresses or integers, you can check out [ValueNote](#valuenote), or [AddressNote](#addressnote).

## Standard Note Type

A note type can be defined with the macro `#[note]` used on a struct:

```rust title="state_vars-CardNote" showLineNumbers
// We derive the Serialize trait because this struct is returned from a contract function. When returned,
// the struct is serialized using the Serialize trait and added to a hasher via the `add_to_hasher` utility.
// We use a hash rather than the serialized struct itself to keep circuit inputs constant.
#[derive(Eq, Serialize, Deserialize, Packable)]
#[note]
pub struct CardNote {
    points: u8,
    randomness: Field,
    owner: AztecAddress,
}
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/types/card_note.nr#L7-L18" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/types/card_note.nr#L7-L18</a></sub></sup>

<!-- TODO: Explain what #[derive(Eq, Serialize, Deserialize, Packable)] are in the code block -->

In this example, we are implementing a card note that holds a number of `points` as `u8`.

`randomness` is not enforced by the protocol and should be implemented by the application developer. If you do not include `randomness`, and the note preimage can be guessed by an attacker, it makes the note vulnerable to preimage attacks.

`owner` is used when nullifying the note to obtain a nullifier secret key.
It ensures that when a note is spent, only the owner can spend it and the note sender cannot figure out that the note has been spent!
Providing the `owner` with improved privacy.

Why is it delivering privacy from sender?

Because a sender cannot derive a note nullifier.
We could derive the nullifier based solely on the note itself (for example, by computing `hash([note.points, note.owner, note.randomness], NULLIFIER_SEPARATOR)`).
This would work since the nullifier would be unique and only the note recipient could spend it (as contract logic typically only allows the note owner to obtain a note, e.g. from a `Map<...>`).
However, if we did this, the sender could also derive the nullifier offchain and monitor the nullifier tree for its inclusion, allowing them to determine when a note has been spent.
This would leak privacy.

## Examples

Address notes hold one main property of the type `AztecAddress`. It also holds `owner` and `randomness`, similar to other note types.

### AddressNote

This is the AddressNote:

```rust title="address_note_def" showLineNumbers
#[derive(Eq, Packable)]
#[note]
pub struct AddressNote {
    address: AztecAddress,
    owner: AztecAddress,
    randomness: Field,
}

impl AddressNote {
    pub fn new(address: AztecAddress, owner: AztecAddress) -> Self {
        // Safety: we use the randomness to preserve the privacy of the note recipient by preventing brute-forcing, so a
        // malicious sender could use non-random values to make the note less private. But they already know the full
        // note pre-image anyway, and so the recipient already trusts them to not disclose this information. We can
        // therefore assume that the sender will cooperate in the random value generation.
        let randomness = unsafe { random() };
        AddressNote { address, owner, randomness }
    }

    pub fn get_address(self) -> AztecAddress {
        self.address
    }
}
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/aztec-nr/address-note/src/address_note.nr#L7-L30" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/address-note/src/address_note.nr#L7-L30</a></sub></sup>

#### Importing AddressNote

##### In Nargo.toml

```toml
address_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v2.0.2", directory="noir-projects/aztec-nr/address-note" }
```

##### In your contract

```rust title="addressnote_import" showLineNumbers
use dep::address_note::address_note::AddressNote;
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/escrow_contract/src/main.nr#L12-L14" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/escrow_contract/src/main.nr#L12-L14</a></sub></sup>

#### Working with AddressNote

##### Creating a new note

Creating a new `AddressNote` takes the following args:

- `address` (`AztecAddress`): the address to store in the AddressNote
- `owner` (`AztecAddress`): owner is the party whose nullifying key can be used to spend the note

```rust title="addressnote_new" showLineNumbers
let note = AddressNote::new(owner, owner);
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/escrow_contract/src/main.nr#L26-L28" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/escrow_contract/src/main.nr#L26-L28</a></sub></sup>

In this example, `owner` is the `address` and the `npk_m_hash` of the donor was computed earlier.

### ValueNote

This is the ValueNote struct:

```rust title="value-note-def" showLineNumbers
#[derive(Eq, Packable)]
#[note]
pub struct ValueNote {
    value: Field,
    owner: AztecAddress,
    randomness: Field,
}
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/aztec-nr/value-note/src/value_note.nr#L7-L15" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/value-note/src/value_note.nr#L7-L15</a></sub></sup>

#### Importing ValueNote

##### In Nargo.toml

```toml
value_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v2.0.2", directory="noir-projects/aztec-nr/value-note" }
```

##### In your contract

```rust title="import_valuenote" showLineNumbers
use dep::value_note::value_note::ValueNote;
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/test/child_contract/src/main.nr#L15-L17" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/child_contract/src/main.nr#L15-L17</a></sub></sup>

#### Working with ValueNote

##### Creating a new note

Creating a new `ValueNote` takes the following args:

- `value` (`Field`): the value of the ValueNote
- `owner` (`AztecAddress`): owner is the party whose nullifying key can be used to spend the note

```rust title="valuenote_new" showLineNumbers
let note = ValueNote::new(new_value, owner);
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/test/child_contract/src/main.nr#L61-L63" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/child_contract/src/main.nr#L61-L63</a></sub></sup>

##### Getting a balance

A user may have multiple notes in a set that all refer to the same content (e.g. a set of notes representing a single token balance). By using the `ValueNote` type to represent token balances, you do not have to manually add each of these notes and can instead use a helper function `get_balance()`.

It takes one argument - the set of notes.

```rust title="get_balance" showLineNumbers
// Return the sum of all notes in the set.
balance_utils::get_balance(owner_balance)
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/test/stateful_test_contract/src/main.nr#L106-L109" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/stateful_test_contract/src/main.nr#L106-L109</a></sub></sup>

This can only be used in an unconstrained function.

##### Incrementing and decrementing

Both `increment` and `decrement` functions take the same args:

```rust title="increment_args" showLineNumbers
balance: PrivateSet<ValueNote, &mut PrivateContext>,
amount: Field,
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/aztec-nr/value-note/src/utils.nr#L28-L31" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/value-note/src/utils.nr#L28-L31</a></sub></sup>

Note that this will create a new note in the set of notes passed as the first argument.
For example:

```rust title="increment_valuenote" showLineNumbers
increment(storage.notes.at(owner), value, owner);
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/test/benchmarking_contract/src/main.nr#L28-L30" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/benchmarking_contract/src/main.nr#L28-L30</a></sub></sup>

The `decrement` function works similarly except the `amount` is the number that the value will be decremented by, and it will fail if the sum of the selected notes is less than the amount.

### Custom Note Type

Using the `#[custom_note]` macro allows you to define your own note hash and nullifier schemes for your notes, rather than using the default poseidon2 hash of the note to generate the note hash or using the note owners nullifier key to generate a nullifier.

The TransparentNote in an example token contract demonstrates how you can generate a custom note hash and nullifiers.

```rust title="transparent_note_impl" showLineNumbers
impl NoteHash for TransparentNote {
    fn compute_note_hash(self, storage_slot: Field) -> Field {
        let inputs = self.pack().concat([storage_slot]);
        poseidon2_hash_with_separator(inputs, GENERATOR_INDEX__NOTE_HASH)
    }

    // Computing a nullifier in a transparent note is not guarded by making secret a part of the nullifier preimage (as
    // is common in other cases) and instead is guarded by the functionality of "redeem_shield" function. There we do
    // the following:
    //      1) We pass the secret as an argument to the function and use it to compute a secret hash,
    //      2) we fetch a note via the "get_notes" oracle which accepts the secret hash as an argument,
    //      3) the "get_notes" oracle constrains that the secret hash in the returned note matches the one computed in
    //         circuit.
    // This achieves that the note can only be spent by the party that knows the secret.
    fn compute_nullifier(
        self,
        _context: &mut PrivateContext,
        note_hash_for_nullify: Field,
    ) -> Field {
        poseidon2_hash_with_separator(
            [note_hash_for_nullify],
            GENERATOR_INDEX__NOTE_NULLIFIER as Field,
        )
    }

    unconstrained fn compute_nullifier_unconstrained(self, note_hash_for_nullify: Field) -> Field {
        // compute_nullifier ignores context so we can reuse it here
        self.compute_nullifier(zeroed(), note_hash_for_nullify)
    }
}
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/noir-projects/noir-contracts/contracts/app/token_blacklist_contract/src/types/transparent_note.nr#L24-L55" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_blacklist_contract/src/types/transparent_note.nr#L24-L55</a></sub></sup>

## Further reading

- [What is `#[note]` actually doing? + functions such as serialize() and deserialize()](../../concepts/smart_contracts/functions/attributes.md#implementing-notes)
- [Macros reference](../../reference/smart_contract_reference/macros.md)
- [Keys, including npk_m_hash (nullifier public key master)](../../concepts/accounts/keys.md)
