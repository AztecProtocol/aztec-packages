
# Storage Slots

## Public State Slots

As mentioned in [State Model](../storage/state_model/index.md), Aztec public state behaves similarly to public state on Ethereum from the point of view of the developer. Behind the scenes however, the storage is managed differently. As mentioned, public state has just one large sparse tree in Aztec - so we silo slots of public data by hashing it together with its contract address.

The mental model is that we have a key-value store, where the siloed slot is the key, and the value is the data stored in that slot. You can think of the `real_storage_slot` identifying its position in the tree, and the `logical_storage_slot` identifying the position in the contract storage.

```rust
real_storage_slot = H(contract_address, logical_storage_slot)
```

The siloing is performed by the [Kernel circuits](../circuits/index.md).

For structs and arrays, we are logically using a similar storage slot computation to ethereum, e.g., as a struct with 3 fields would be stored in 3 consecutive slots. However, because the "actual" storage slot is computed as a hash of the contract address and the logical storage slot, the actual storage slot is not consecutive.

## Private State Slots

Private storage is a different beast. As you might remember from [Hybrid State Model](../storage/state_model/index.md), private state is stored in encrypted logs and the corresponding private state commitments in append-only tree, called the note hash tree where each leaf is a commitment. Append-only means that leaves are never updated or deleted; instead a nullifier is emitted to signify that some note is no longer valid. A major reason we used this tree, is that updates at a specific storage slot would leak information in the context of private state, even if the value is encrypted. That is not good privacy.

Following this, the storage slot as we know it doesn't really exist. The leaves of the note hashes tree are just commitments to content (think of it as a hash of its content).

Nevertheless, the concept of a storage slot is very useful when writing applications, since it allows us to reason about distinct and disjoint pieces of data. For example we can say that the balance of an account is stored in a specific slot and that the balance of another account is stored in another slot with the total supply stored in some third slot. By making sure that these slots are disjoint, we can be sure that the balances are not mixed up and that someone cannot use the total supply as their balance.

### Implementation

If we include the storage slot, as part of the note whose commitment is stored in the note hashes tree, we can _logically link_ all the notes that make up the storage slot. For the case of a balance, we can say that the balance is the sum of all the notes that have the same storage slot - in the same way that your physical wallet balance is the sum of all the physical notes in your wallet.

Similarly to how we siloed the public storage slots, we can silo our private storage by hashing the logical storage slot together with the note content.

```rust
note_hash = H(logical_storage_slot, note_content_hash);
```

Note hash siloing is done in the application circuit, since it is not necessary for security of the network (but only the application).
:::info
The private variable wrappers `PrivateSet` and `PrivateMutable` in Aztec.nr include the `logical_storage_slot` in the commitments they compute, to make it easier for developers to write contracts without having to think about how to correctly handle storage slots.
:::

When reading the values for these notes, the application circuit can then constrain the values to only read notes with a specific logical storage slot.

To ensure that contracts can only modify their own logical storage, we do a second siloing by hashing the `commitment` with the contract address.

```rust
siloed_note_hash = H(contract_address, note_hash);
```

By doing this address-siloing at the kernel circuit we _force_ the inserted commitments to include and not lie about the `contract_address`.

:::info
To ensure that nullifiers don't collide across contracts we also force this contract siloing at the kernel level.
:::

For an example of this see [developer documentation on storage](../../../build/reference/smart_contract_reference/storage/index.md).
