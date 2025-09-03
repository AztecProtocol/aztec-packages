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

#include_code state_vars-CardNote noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/types/card_note.nr rust

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
However, if we did this, the sender could also derive the nullifier off-chain and monitor the nullifier tree for its inclusion, allowing them to determine when a note has been spent.
This would leak privacy.


## Examples

Address notes hold one main property of the type `AztecAddress`. It also holds `owner` and `randomness`, similar to other note types.

### AddressNote

This is the AddressNote:

#include_code address_note_def noir-projects/aztec-nr/address-note/src/address_note.nr rust

#### Importing AddressNote

##### In Nargo.toml

```toml
address_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/address-note" }
```

##### In your contract

#include_code addressnote_import noir-projects/noir-contracts/contracts/app/escrow_contract/src/main.nr rust

#### Working with AddressNote

##### Creating a new note

Creating a new `AddressNote` takes the following args:

- `address` (`AztecAddress`): the address to store in the AddressNote
- `owner` (`AztecAddress`): owner is the party whose nullifying key can be used to spend the note

#include_code addressnote_new noir-projects/noir-contracts/contracts/app/escrow_contract/src/main.nr rust

In this example, `owner` is the `address` and the `npk_m_hash` of the donor was computed earlier.

### ValueNote

This is the ValueNote struct:

#include_code value-note-def noir-projects/aztec-nr/value-note/src/value_note.nr rust

#### Importing ValueNote

##### In Nargo.toml

```toml
value_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="#include_aztec_version", directory="noir-projects/aztec-nr/value-note" }
```

##### In your contract

#include_code import_valuenote noir-projects/noir-contracts/contracts/test/child_contract/src/main.nr rust

#### Working with ValueNote

##### Creating a new note

Creating a new `ValueNote` takes the following args:

- `value` (`Field`): the value of the ValueNote
- `owner` (`AztecAddress`): owner is the party whose nullifying key can be used to spend the note

#include_code valuenote_new noir-projects/noir-contracts/contracts/test/child_contract/src/main.nr rust

##### Getting a balance

A user may have multiple notes in a set that all refer to the same content (e.g. a set of notes representing a single token balance). By using the `ValueNote` type to represent token balances, you do not have to manually add each of these notes and can instead use a helper function `get_balance()`.

It takes one argument - the set of notes.

#include_code get_balance noir-projects/noir-contracts/contracts/test/stateful_test_contract/src/main.nr rust

This can only be used in an unconstrained function.

##### Incrementing and decrementing

Both `increment` and `decrement` functions take the same args:

#include_code increment_args noir-projects/aztec-nr/value-note/src/utils.nr rust

Note that this will create a new note in the set of notes passed as the first argument.
For example:
#include_code increment_valuenote noir-projects/noir-contracts/contracts/test/benchmarking_contract/src/main.nr rust

The `decrement` function works similarly except the `amount` is the number that the value will be decremented by, and it will fail if the sum of the selected notes is less than the amount.

### Custom Note Type

Using the `#[custom_note]` macro allows you to define your own note hash and nullifier schemes for your notes, rather than using the default poseidon2 hash of the note to generate the note hash or using the note owners nullifier key to generate a nullifier.

The TransparentNote in an example token contract demonstrates how you can generate a custom note hash and nullifiers.

#include_code transparent_note_impl noir-projects/noir-contracts/contracts/app/token_blacklist_contract/src/types/transparent_note.nr rust

## Further reading

- [What is `#[note]` actually doing? + functions such as serialize() and deserialize()](../../../aztec/smart_contracts/functions/attributes.md#implementing-notes)
- [Macros reference](../../../developers/reference/smart_contract_reference/macros.md)
- [Keys, including npk_m_hash (nullifier public key master)](../../../aztec/concepts/accounts/keys.md)
