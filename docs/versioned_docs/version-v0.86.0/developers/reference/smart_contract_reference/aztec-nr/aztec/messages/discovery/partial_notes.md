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

### process_partial_note_private_msg

```rust
process_partial_note_private_msg(contract_address, recipient, msg_metadata, msg_content, MAX_MESSAGE_CONTENT_LEN>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| recipient | AztecAddress |
| msg_metadata | u64 |
| msg_content | BoundedVec&lt;Field |
| MAX_MESSAGE_CONTENT_LEN&gt; |  |
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

### decode_partial_note_private_msg

```rust
decode_partial_note_private_msg(msg_metadata, msg_content, MAX_MESSAGE_CONTENT_LEN>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| msg_metadata | u64 |
| msg_content | BoundedVec&lt;Field |
| MAX_MESSAGE_CONTENT_LEN&gt; |  |
|  |  |

