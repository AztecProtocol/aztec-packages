---
title: Using Value Notes in Aztec.nr
tags: [contracts, notes]
---

ValueNotes hold one main property - a `value` - and have utils useful for manipulating this value, such as incrementing and decrementing it similarly to an integer.

## ValueNote

This is the ValueNote struct:

```rust title="value-note-def" showLineNumbers 
#[note]
#[derive(Eq)]
pub struct ValueNote {
    value: Field,
    owner: AztecAddress,
    randomness: Field,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/noir-projects/aztec-nr/value-note/src/value_note.nr#L3-L11" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/value-note/src/value_note.nr#L3-L11</a></sub></sup>


## Importing ValueNote

### In Nargo.toml

```toml
value_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v0.88.0", directory="noir-projects/aztec-nr/value-note" }
```

### In your contract

```rust title="import_valuenote" showLineNumbers 
use dep::value_note::value_note::ValueNote;
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/noir-projects/noir-contracts/contracts/test/child_contract/src/main.nr#L14-L16" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/child_contract/src/main.nr#L14-L16</a></sub></sup>


## Working with ValueNote

### Creating a new note

Creating a new `ValueNote` takes the following args:

- `value` (`Field`): the value of the ValueNote
- `owner` (`AztecAddress`): owner is the party whose nullifying key can be used to spend the note

```rust title="valuenote_new" showLineNumbers 
let note = ValueNote::new(new_value, owner);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/noir-projects/noir-contracts/contracts/test/child_contract/src/main.nr#L60-L62" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/child_contract/src/main.nr#L60-L62</a></sub></sup>


### Getting a balance

A user may have multiple notes in a set that all refer to the same content (e.g. a set of notes representing a single token balance). By using the `ValueNote` type to represent token balances, you do not have to manually add each of these notes and can instead use a helper function `get_balance()`.

It takes one argument - the set of notes.

```rust title="get_balance" showLineNumbers 
// Return the sum of all notes in the set.
balance_utils::get_balance(owner_balance)
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/noir-projects/noir-contracts/contracts/test/stateful_test_contract/src/main.nr#L105-L108" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/stateful_test_contract/src/main.nr#L105-L108</a></sub></sup>


This can only be used in an unconstrained function.

### Incrementing and decrementing

Both `increment` and `decrement` functions take the same args:

```rust title="increment_args" showLineNumbers 
balance: PrivateSet<ValueNote, &mut PrivateContext>,
amount: Field,
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/noir-projects/aztec-nr/value-note/src/utils.nr#L27-L30" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/value-note/src/utils.nr#L27-L30</a></sub></sup>


Note that this will create a new note in the set of notes passed as the first argument.
For example:
```rust title="increment_valuenote" showLineNumbers 
increment(storage.notes.at(owner), value, owner, sender);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/noir-projects/noir-contracts/contracts/test/benchmarking_contract/src/main.nr#L24-L26" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/benchmarking_contract/src/main.nr#L24-L26</a></sub></sup>


The `decrement` function works similarly except the `amount` is the number that the value will be decremented by, and it will fail if the sum of the selected notes is less than the amount.

## Learn more

- [Keys, including nullifier keys and outgoing viewer](../../../../../aztec/concepts/accounts/keys.md)
- [How to implement a note](./implementing_a_note.md)
- [ValueNote reference](../../../../reference/smart_contract_reference/aztec-nr/value-note/value_note.md)
