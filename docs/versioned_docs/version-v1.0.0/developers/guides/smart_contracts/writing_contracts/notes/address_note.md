---
title: Using Address Note in Aztec.nr
tags: [contracts, notes]
---

Address notes hold one main property of the type `AztecAddress`. It also holds `owner` and `randomness`, similar to other note types.

## AddressNote

This is the AddressNote:

```rust title="address_note_def" showLineNumbers 
#[note]
#[derive(Eq)]
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
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/aztec-nr/address-note/src/address_note.nr#L5-L24" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/address-note/src/address_note.nr#L5-L24</a></sub></sup>


## Importing AddressNote

### In Nargo.toml

```toml
address_note = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v1.0.0", directory="noir-projects/aztec-nr/address-note" }
```

### In your contract

```rust title="addressnote_import" showLineNumbers 
use dep::address_note::address_note::AddressNote;
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/escrow_contract/src/main.nr#L14-L16" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/escrow_contract/src/main.nr#L14-L16</a></sub></sup>


## Working with AddressNote

### Creating a new note

Creating a new `AddressNote` takes the following args:

- `address` (`AztecAddress`): the address to store in the AddressNote
- `owner` (`AztecAddress`): owner is the party whose nullifying key can be used to spend the note

```rust title="addressnote_new" showLineNumbers 
let note = AddressNote::new(owner, owner);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/noir-projects/noir-contracts/contracts/app/escrow_contract/src/main.nr#L28-L30" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/escrow_contract/src/main.nr#L28-L30</a></sub></sup>


In this example, `owner` is the `address` and the `npk_m_hash` of the donor was computed earlier.

## Learn more

- [Keys, including nullifier keys and outgoing viewer](../../../../../aztec/concepts/accounts/keys.md)
- [How to implement a note](./implementing_a_note.md)
- [AddressNote reference](../../../../reference/smart_contract_reference/aztec-nr/address-note/address_note.md)
