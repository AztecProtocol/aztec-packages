---
title: How to define compute_note_hash_and_nullifier
---
<!-- This file is now hidden from docs (sidebars) but leaving it here in case we might need it. -->

Aztec will automatically compute and manage notes and nullifiers that are created in smart contracts. However, in some cases, it might make sense to write custom logic for how these are computed. This is achieved through the `compute_note_hash_and_nullifier()` function, which tells the [PXE](../../../../learn/concepts/pxe/main.md) how to handle notes in your smart contract. Usually this is automatically generated. But if you want to handle it manually:

## Params and returns

The function should take 5 parameters:

* Contract address
* Nonce
* Storage slot
* Note type ID
* Serialized note

It should return `pub [Field; 4]` which is an array of 4 elements that tells the PXE how to handle the notes and nullifiers. For ValueNote:

```rust
unconstrained fn compute_note_hash_and_nullifier(
    contract_address: AztecAddress,
    nonce: Field,
    storage_slot: Field,
    note_type_id: Field,
    serialized_note: [Field; VALUE_NOTE_LEN]
) -> pub [Field; 4] {
    let note_header = NoteHeader::new(contract_address, nonce, storage_slot);
    dep::aztec::note::utils::compute_note_hash_and_nullifier(ValueNote::deserialize_content, note_header, serialized_note)
}
```

If your contract has multiple types of notes, you can deserialize_content based on note ID and storage slot. E.g.

```rust
unconstrained fn compute_note_hash_and_nullifier(
    contract_address: AztecAddress,
    nonce: Field,
    storage_slot: Field,
    preimage: [Field; TOKEN_NOTE_LEN]
) -> pub [Field; 4] {
    let note_header = NoteHeader::new(contract_address, nonce, storage_slot);

    if (storage_slot == storage.pending_shields.get_storage_slot()) {
        note_utils::compute_note_hash_and_nullifier(TransparentNote::deserialize_content, note_header, preimage)
    } else if (note_type_id == storage.slow_update.get_storage_slot()) {
        note_utils::compute_note_hash_and_nullifier(FieldNote::deserialize_content, note_header, preimage)
    } else {
        note_utils::compute_note_hash_and_nullifier(TokenNote::deserialize_content, note_header, preimage)
    }
}
```