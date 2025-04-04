# DeliveredPendingPartialNote

## Fields
| Field | Type |
| --- | --- |
| pub(crate) note_completion_log_tag | Field |
| pub(crate) storage_slot | Field |
| pub(crate) note_type_id | Field |
| pub(crate) packed_private_note_content | BoundedVec&lt;Field, MAX_PARTIAL_NOTE_PRIVATE_PACKED_LEN&gt; |
| pub(crate) recipient | AztecAddress |

## Standalone Functions

### process_partial_note_private_log

```rust
process_partial_note_private_log(contract_address, recipient, log_metadata, log_content, MAX_LOG_CONTENT_LEN>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| recipient | AztecAddress |
| log_metadata | u64 |
| log_content | BoundedVec&lt;Field |
| MAX_LOG_CONTENT_LEN&gt; |  |
|  |  |

### fetch_and_process_public_partial_note_completion_logs

```rust
fetch_and_process_public_partial_note_completion_logs(contract_address, compute_note_hash_and_nullifier, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| compute_note_hash_and_nullifier | ComputeNoteHashAndNullifier&lt;Env&gt; |
|  |  |

### decode_partial_note_private_log

```rust
decode_partial_note_private_log(log_metadata, log_content, MAX_LOG_CONTENT_LEN>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| log_metadata | u64 |
| log_content | BoundedVec&lt;Field |
| MAX_LOG_CONTENT_LEN&gt; |  |
|  |  |

