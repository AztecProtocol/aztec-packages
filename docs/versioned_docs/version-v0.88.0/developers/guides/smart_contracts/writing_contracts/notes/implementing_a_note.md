---
title: Implementing a note in Aztec.nr
tags: [contracts, notes]
keywords: [implementing note, note]
---

You may want to create your own note type if you need to use a specific type of private data or struct that is not already implemented in Aztec.nr, or if you want to experiment with custom note hashing and nullifier schemes. For custom hashing and nullifier schemes, use the `#[custom_note]` macro instead of `#[note]`, as it does not automatically derive the `NoteHash` trait.

For example, if you are developing a card game, you may want to store multiple pieces of data in each card. Rather than storing each piece of data in its own note, you can define a card note type that contains all the data, and then nullify (or exchange ownership of) the card when it has been used.

If you want to work with values, addresses or integers, you can check out [ValueNote](./value_note.md), [AddressNote](./address_note.md) or `UintNote`.

## Define a note type

You will likely want to define your note in a new file and import it into your contract.

A note type can be defined with the macro `#[note]` used on a struct:

```rust title="state_vars-CardNote" showLineNumbers 
// We derive the Serialize trait because this struct is returned from a contract function. When returned,
// the struct is serialized using the Serialize trait and added to a hasher via the `add_to_hasher` utility.
// We use a hash rather than the serialized struct itself to keep circuit inputs constant.
#[note]
#[derive(Eq, Serialize, Deserialize)]
pub struct CardNote {
    points: u8,
    randomness: Field,
    owner: AztecAddress,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.88.0/noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/types/card_note.nr#L6-L17" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/docs/docs_example_contract/src/types/card_note.nr#L6-L17</a></sub></sup>


In this example, we are implementing a card note that holds a number of `points` as `u8`.

`randomness` is not enforced by the protocol and should be implemented by the application developer. If you do not include `randomness`, and the note preimage can be guessed by an attacker, it makes the note vulnerable to preimage attacks.

`owner` is used when nullifying the note to obtain a nullifer secret key.
It ensures that when a note is spent, only the owner can spend it and the note sender cannot figure out that the note has been spent!
Providing the `owner` with improved privacy.

Why is it delivering privacy from sender?

Because a sender cannot derive a note nullifier.
We could derive the nullifier based solely on the note itself (for example, by computing `hash([note.points, note.owner, note.randomness], NULLIFIER_SEPARATOR)`).
This would work since the nullifier would be unique and only the note recipient could spend it (as contract logic typically only allows the note owner to obtain a note, e.g. from a `Map<...>`).
However, if we did this, the sender could also derive the nullifier off-chain and monitor the nullifier tree for its inclusion, allowing them to determine when a note has been spent.
This would leak privacy.

## Further reading

- [What is `#[note]` actually doing? + functions such as serialize() and deserialize()](../../../../../aztec/smart_contracts/functions/attributes.md#implementing-notes)
- [Macros reference](../../../../reference/smart_contract_reference/macros.md)
- [Keys, including npk_m_hash (nullifier public key master)](../../../../../aztec/concepts/accounts/keys.md)
