## Standalone Functions

### emit_encrypted_log_oracle

```rust
emit_encrypted_log_oracle(_contract_address, _storage_slot, _note_type_id, _encryption_pub_key, _preimage, _counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| _contract_address | AztecAddress |
| _storage_slot | Field |
| _note_type_id | Field |
| _encryption_pub_key | GrumpkinPoint |
| _preimage | [Field; N] |
| _counter | u32 |

### emit_encrypted_log

```rust
emit_encrypted_log(contract_address, storage_slot, note_type_id, encryption_pub_key, preimage, counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| storage_slot | Field |
| note_type_id | Field |
| encryption_pub_key | GrumpkinPoint |
| preimage | [Field; N] |
| counter | u32 |

