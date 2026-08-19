---
title: Storage Slots
tags: [storage, concepts, advanced]
sidebar_position: 1
description: Understand how storage slots work in Aztec for both public and private state, including siloing mechanisms and note hash commitments.
references: ["noir-projects/labs/aztec-nr/aztec/src/state_vars/*", "noir-projects/fnd/noir-protocol-circuits/crates/types/src/hash.nr"]
---

Storage slots in Aztec serve a similar purpose to Ethereum—they identify where contract state is stored. However, Aztec handles public and private state differently to maintain privacy guarantees while preventing conflicts between contracts.

:::note
In the formulas below, `H()` represents a hash function (specifically poseidon2 in the protocol).
:::

## Public State Slots

As described in [State Model](../../state_management.md), Aztec public state behaves similarly to public state on Ethereum from a developer's perspective. Behind the scenes, however, the storage is managed differently. Public state uses a single large sparse tree, so we silo slots by hashing them with the contract address:

```rust
siloed_storage_slot = H(contract_address, storage_slot)
```

You can think of `storage_slot` as the logical position in contract storage, while `siloed_storage_slot` identifies the actual position in the global tree. This siloing is performed by the [kernel circuits](../circuits/private_kernel.md).

For structs and arrays, logical storage slots are computed similarly to Ethereum (e.g., a struct with 3 fields uses 3 consecutive logical slots). However, since siloed slots are hashes, the actual tree positions are not consecutive.

## Private State Slots

Private storage works differently. As described in [State Model](../../state_management.md), private state is stored as encrypted logs with corresponding commitments in the note hash tree—an append-only structure where each leaf is a note hash. Notes are never updated or deleted; instead, a nullifier is emitted to invalidate a note. This append-only design prevents information leakage that would occur if we updated specific storage slots, even with encrypted values.

Because of this, storage slots don't exist in the traditional sense for private state. The note hash tree leaves are simply commitments to note content.

Nevertheless, the concept of a storage slot remains useful for application logic. It allows us to reason about distinct pieces of data—for example, ensuring that one account's balance cannot be confused with another's, or with the total supply.

### How Storage Slots Work in Private State

Storage slots are included as part of the note hash computation, logically linking all notes that belong to the same slot. For a token balance, this means the balance equals the sum of all non-nullified notes sharing the same storage slot—similar to how a physical wallet's balance is the sum of the bills inside it.

The note hash computation includes the storage slot along with other note data (owner, randomness, and note-specific values). This happens in the application circuit. The private state variable wrappers in Aztec.nr (`PrivateSet`, `PrivateMutable`, etc.) handle this automatically.

When reading notes, the application circuit constrains which storage slot the notes must belong to, ensuring notes from different slots cannot be mixed.

### Contract Address Siloing

To ensure contracts can only modify their own storage, the kernel circuit performs a second siloing step:

```rust
siloed_note_hash = H(contract_address, note_hash)
```

This forces all note hashes to be scoped to the contract that created them. The kernel then makes each note hash unique by incorporating a nonce derived from the transaction:

```rust
unique_note_hash = H(note_nonce, siloed_note_hash)
```

This `unique_note_hash` is what gets inserted into the note hash tree.

:::info
Nullifiers are also siloed by contract address at the kernel level to prevent collisions across contracts.
:::

### Privacy Implications

With this design, knowing a storage slot is not sufficient to determine what data it contains—unlike public state where the slot directly maps to a value. The note hash tree only contains commitments, and the storage slot is just one component mixed into those commitments. This is a key property that enables private state in Aztec.

## Further Reading

- [State Model](../../state_management.md) - Overview of public and private state in Aztec
- [Private Kernel Circuits](../circuits/private_kernel.md) - How siloing is enforced at the protocol level
