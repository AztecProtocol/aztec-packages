# LogRetrievalResponse

## Fields
| Field | Type |
| --- | --- |
| pub log_payload | BoundedVec&lt;Field, MAX_LOG_CONTENT_LEN&gt; |
| pub tx_hash | Field |
| pub unique_note_hashes_in_tx | BoundedVec&lt;Field, MAX_NOTE_HASHES_PER_TX&gt; |
| pub first_nullifier_in_tx | Field |

## Standalone Functions

### deserialization_matches_typescript

```rust
deserialization_matches_typescript();
```

Takes no parameters.

