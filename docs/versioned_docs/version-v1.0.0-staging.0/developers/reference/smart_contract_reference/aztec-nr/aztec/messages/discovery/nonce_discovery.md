# DiscoveredNoteInfo

/ A struct with the discovered information of a complete note, required for delivery to PXE. Note that this is *not* / the complete note information, since it does not include content, storage slot, etc.

## Fields
| Field | Type |
| --- | --- |
| pub note_nonce | Field |
| pub note_hash | Field |
| pub inner_nullifier | Field |

# NoteAndData

## Fields
| Field | Type |
| --- | --- |
| note | MockNote |
| note_nonce | Field |
| note_hash | Field |
| unique_note_hash | Field |
| inner_nullifier | Field |

## Standalone Functions

### attempt_note_nonce_discovery

```rust
attempt_note_nonce_discovery(unique_note_hashes_in_tx, MAX_NOTE_HASHES_PER_TX>, first_nullifier_in_tx, compute_note_hash_and_nullifier, contract_address, storage_slot, note_type_id, packed_note, MAX_NOTE_PACKED_LEN>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| unique_note_hashes_in_tx | BoundedVec&lt;Field |
| MAX_NOTE_HASHES_PER_TX&gt; |  |
| first_nullifier_in_tx | Field |
| compute_note_hash_and_nullifier | ComputeNoteHashAndNullifier&lt;Env&gt; |
| contract_address | AztecAddress |
| storage_slot | Field |
| note_type_id | Field |
| packed_note | BoundedVec&lt;Field |
| MAX_NOTE_PACKED_LEN&gt; |  |
|  |  |

### compute_note_hash_and_nullifier

```rust
compute_note_hash_and_nullifier(packed_note, MAX_NOTE_PACKED_LEN>, storage_slot, note_type_id, contract_address, note_nonce, );
```

#### Parameters
| Name | Type |
| --- | --- |
| packed_note | BoundedVec&lt;Field |
| MAX_NOTE_PACKED_LEN&gt; |  |
| storage_slot | Field |
| note_type_id | Field |
| contract_address | AztecAddress |
| note_nonce | Field |
|  |  |

### no_note_hashes

```rust
no_note_hashes();
```

Takes no parameters.

### failed_hash_computation

```rust
failed_hash_computation();
```

Takes no parameters.

### construct_note

```rust
construct_note(value, note_index_in_tx);
```

#### Parameters
| Name | Type |
| --- | --- |
| value | Field |
| note_index_in_tx | u32 |

### single_note

```rust
single_note();
```

Takes no parameters.

### multiple_notes_same_preimage

```rust
multiple_notes_same_preimage();
```

Takes no parameters.

