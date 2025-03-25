## Standalone Functions

### process_private_note_log

```rust
process_private_note_log(contract_address, tx_hash, unique_note_hashes_in_tx, MAX_NOTE_HASHES_PER_TX>, first_nullifier_in_tx, recipient, compute_note_hash_and_nullifier, log_metadata, log_content, MAX_LOG_CONTENT_LEN>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| tx_hash | Field |
| unique_note_hashes_in_tx | BoundedVec&lt;Field |
| MAX_NOTE_HASHES_PER_TX&gt; |  |
| first_nullifier_in_tx | Field |
| recipient | AztecAddress |
| compute_note_hash_and_nullifier | ComputeNoteHashAndNullifier&lt;Env&gt; |
| log_metadata | u64 |
| log_content | BoundedVec&lt;Field |
| MAX_LOG_CONTENT_LEN&gt; |  |
|  |  |

### attempt_note_discovery

```rust
attempt_note_discovery(contract_address, tx_hash, unique_note_hashes_in_tx, MAX_NOTE_HASHES_PER_TX>, first_nullifier_in_tx, recipient, compute_note_hash_and_nullifier, storage_slot, note_type_id, packed_note, MAX_NOTE_PACKED_LEN>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| tx_hash | Field |
| unique_note_hashes_in_tx | BoundedVec&lt;Field |
| MAX_NOTE_HASHES_PER_TX&gt; |  |
| first_nullifier_in_tx | Field |
| recipient | AztecAddress |
| compute_note_hash_and_nullifier | ComputeNoteHashAndNullifier&lt;Env&gt; |
| storage_slot | Field |
| note_type_id | Field |
| packed_note | BoundedVec&lt;Field |
| MAX_NOTE_PACKED_LEN&gt; |  |
|  |  |

### decode_private_note_log

```rust
decode_private_note_log(log_metadata, log_content, MAX_LOG_CONTENT_LEN>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| log_metadata | u64 |
| log_content | BoundedVec&lt;Field |
| MAX_LOG_CONTENT_LEN&gt; |  |
|  |  |

