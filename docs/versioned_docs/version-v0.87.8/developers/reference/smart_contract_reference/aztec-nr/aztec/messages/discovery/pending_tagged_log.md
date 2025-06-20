# PendingTaggedLog

## Fields
| Field | Type |
| --- | --- |
| pub log | BoundedVec&lt;Field, PRIVATE_LOG_SIZE_IN_FIELDS&gt; |
| pub tx_hash | Field |
| pub unique_note_hashes_in_tx | BoundedVec&lt;Field, MAX_NOTE_HASHES_PER_TX&gt; |
| pub first_nullifier_in_tx | Field |
| pub recipient | AztecAddress |
| pub log_index_in_tx | Field |
| pub tx_index_in_block | Field |

## Standalone Functions

### pending_tagged_log_serialization_matches_typescript

```rust
pending_tagged_log_serialization_matches_typescript();
```

Takes no parameters.

