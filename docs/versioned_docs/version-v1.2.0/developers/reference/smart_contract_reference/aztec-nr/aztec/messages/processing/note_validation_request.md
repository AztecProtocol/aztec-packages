# NoteValidationRequest

## Fields
| Field | Type |
| --- | --- |
| pub contract_address | AztecAddress |
| pub storage_slot | Field |
| pub note_nonce | Field |
| pub packed_note | BoundedVec&lt;Field, MAX_NOTE_PACKED_LEN&gt; |
| pub note_hash | Field |
| pub nullifier | Field |
| pub tx_hash | Field |
| pub recipient | AztecAddress |

## Standalone Functions

### serialization_matches_typescript

```rust
serialization_matches_typescript();
```

Takes no parameters.

