---
title: Using the Archive Tree
sidebar_position: 4
tags: [contracts]
---

The Aztec Protocol uses an append-only Merkle tree to store hashes of the headers of all previous blocks in the chain as its leaves. This is known as the Archive tree.

This page is a quick introductory guide to creating historical proofs proofs from the archive tree.

For a reference, go [here](../../../reference/smart_contract_reference/aztec-nr/aztec/history/contract_inclusion.md).

## Inclusion and non-inclusion proofs

Inclusion and non-inclusion proofs refer to proving the inclusion (or absence) of a specific piece of information within a specific Aztec block with a block header. You can prove any of the following at a given block height before the current height:

- Note inclusion
- Nullifier inclusion
- Note validity
- Existence of public value
- Contract inclusion

Using this library, you can check that specific notes or nullifiers were part of Aztec network state at specific blocks. This can be useful for things such as:

- Verifying a minimum timestamp from a private context
- Checking eligibility based on historical events (e.g. for an airdrop by proving that you knew the nullifier key for a note)
- Verifying historic ownership / relinquishing of assets
- Proving existence of a value in public data tree at a given contract slot
- Proving that a contract was deployed in a given block with some parameters

**In this guide you will learn how to**

- Prove a note was included in a specified block
- Create a nullifier and prove it was not included in a specified block

## Create a note to prove inclusion of

In general you will likely have the note you want to prove inclusion of. But if you are just experimenting you can create a note with a function like below:

```rust title="create_note" showLineNumbers 
#[private]
fn call_create_note(
    value: Field,
    owner: AztecAddress,
    sender: AztecAddress,
    storage_slot: Field,
) {
    let note = ValueNote::new(value, owner);
    create_note(&mut context, storage_slot, note).emit(encode_and_encrypt_note(
        &mut context,
        owner,
        sender,
    ));
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/noir-projects/noir-contracts/contracts/test/test_contract/src/main.nr#L139-L154" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/test_contract/src/main.nr#L139-L154</a></sub></sup>


## Get the note from the PXE

Retrieve the note from the user's PXE.

```rust title="get_note_from_pxe" showLineNumbers 
let (retrieved_notes, _): (BoundedVec<RetrievedNote<ValueNote>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>, BoundedVec<Field, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>) =
    get_notes(&mut context, storage_slot, options);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/noir-projects/noir-contracts/contracts/test/test_contract/src/main.nr#L163-L166" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/test_contract/src/main.nr#L163-L166</a></sub></sup>


In this example, we fetch notes located in the storage slot that we pass in from the function parameters. The notes also must match the criteria specified by the getter options that we declare and are able to customize.

## Prove that a note was included in a specified block

To prove that a note existed in a specified block, call `prove_note_inclusion` on the `header` as shown in this example:

```rust title="prove_note_inclusion" showLineNumbers 
context.historical_header.prove_note_inclusion(retrieved_note, test::NOTE_STORAGE_SLOT);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/noir-projects/aztec-nr/aztec/src/history/note_inclusion/test.nr#L10-L12" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/aztec/src/history/note_inclusion/test.nr#L10-L12</a></sub></sup>


This will only prove the note existed at the specific block number, not whether or not the note has been nullified. You can prove that a note existed and had not been nullified in a specified block by using `prove_note_validity` on the block header which takes the following arguments:

```rust title="prove_note_validity" showLineNumbers 
context.historical_header.prove_note_validity(retrieved_note, test::NOTE_STORAGE_SLOT, context);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/noir-projects/aztec-nr/aztec/src/history/note_validity/test.nr#L25-L27" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/aztec/src/history/note_validity/test.nr#L25-L27</a></sub></sup>


## Create a nullifier to prove inclusion of

You can easily nullify a note like so:

```rust title="nullify_note" showLineNumbers 
destroy_note_unsafe(&mut context, retrieved_note, note_hash);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/noir-projects/noir-contracts/contracts/test/test_contract/src/main.nr#L220-L222" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/test/test_contract/src/main.nr#L220-L222</a></sub></sup>


This function gets a note from the PXE and nullifies it with `remove()`.

You can then compute this nullifier with `note.compute_nullifier(&mut context)`.

## Prove that a nullifier was included in a specified block

Call `prove_nullifier_inclusion` on a block header like so:

```rust title="prove_nullifier_inclusion" showLineNumbers 
context.historical_header.prove_nullifier_inclusion(siloed_nullifier);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.9/noir-projects/aztec-nr/aztec/src/history/nullifier_inclusion/test.nr#L60-L62" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/aztec/src/history/nullifier_inclusion/test.nr#L60-L62</a></sub></sup>


It takes the nullifier as an argument.

You can also prove that a note was not nullified in a specified block by using `prove_note_not_nullified` which takes the note and a reference to the private context.

## Prove contract inclusion, public value inclusion, and use current state in lookups

To see what else you can do with historical proofs, check out the [reference](../../../reference/smart_contract_reference/aztec-nr/aztec/history/contract_inclusion.md)
