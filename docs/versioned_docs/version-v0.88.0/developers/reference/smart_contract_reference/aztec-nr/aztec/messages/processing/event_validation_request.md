# EventValidationRequest

## Fields
| Field | Type |
| --- | --- |
| pub contract_address | AztecAddress |
| pub event_type_id | EventSelector |
| pub serialized_event | BoundedVec&lt;Field, MAX_EVENT_SERIALIZED_LEN&gt; |
| pub event_commitment | Field |
| pub tx_hash | Field |
| pub recipient | AztecAddress |
| pub log_index_in_tx | Field |
| pub tx_index_in_block | Field |

## Standalone Functions

### serialization_matches_typescript

```rust
serialization_matches_typescript();
```

Takes no parameters.

