# MessageContext

## Fields
| Field | Type |
| --- | --- |
| pub tx_hash | Field |
| pub unique_note_hashes_in_tx | BoundedVec&lt;Field, MAX_NOTE_HASHES_PER_TX&gt; |
| pub first_nullifier_in_tx | Field |
| pub recipient | AztecAddress |

## Standalone Functions

### message_context_serialization_matches_typescript

```rust
message_context_serialization_matches_typescript();
```

Takes no parameters.

