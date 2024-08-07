## Standalone Functions

### emit_encrypted_note_log_oracle

```rust
emit_encrypted_note_log_oracle(_note_hash_counter, _encrypted_note, _counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| _note_hash_counter | u32 |
| _encrypted_note | [u8; M] |
| _counter | u32 |

### emit_encrypted_note_log

```rust
emit_encrypted_note_log(note_hash_counter, encrypted_note, counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| note_hash_counter | u32 |
| encrypted_note | [u8; M] |
| counter | u32 |

### emit_encrypted_event_log_oracle

```rust
emit_encrypted_event_log_oracle(_contract_address, _randomness, _encrypted_event, _counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| _contract_address | AztecAddress |
| _randomness | Field |
| _encrypted_event | [u8; M] |
| _counter | u32 |

### emit_encrypted_event_log

```rust
emit_encrypted_event_log(contract_address, randomness, encrypted_event, counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| randomness | Field |
| encrypted_event | [u8; M] |
| counter | u32 |

### compute_encrypted_note_log_oracle

```rust
compute_encrypted_note_log_oracle(_contract_address, _storage_slot, _note_type_id, _ovsk_app, _ovpk_m, _ivpk_m, _recipient, _preimage);
```

#### Parameters
| Name | Type |
| --- | --- |
| _contract_address | AztecAddress |
| _storage_slot | Field |
| _note_type_id | Field |
| _ovsk_app | Field |
| _ovpk_m | Point |
| _ivpk_m | Point |
| _recipient | AztecAddress |
| _preimage | [Field; N] |

### compute_encrypted_note_log

```rust
compute_encrypted_note_log(contract_address, storage_slot, note_type_id, ovsk_app, ovpk_m, ivpk_m, recipient, preimage);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| storage_slot | Field |
| note_type_id | Field |
| ovsk_app | Field |
| ovpk_m | Point |
| ivpk_m | Point |
| recipient | AztecAddress |
| preimage | [Field; N] |

### compute_encrypted_event_log_oracle

```rust
compute_encrypted_event_log_oracle(_contract_address, _randomness, _event_type_id, _ovsk_app, _ovpk_m, _ivpk_m, _recipient, _preimage);
```

#### Parameters
| Name | Type |
| --- | --- |
| _contract_address | AztecAddress |
| _randomness | Field |
| _event_type_id | Field |
| _ovsk_app | Field |
| _ovpk_m | Point |
| _ivpk_m | Point |
| _recipient | AztecAddress |
| _preimage | [Field; N] |

### compute_encrypted_event_log

```rust
compute_encrypted_event_log(contract_address, randomness, event_type_id, ovsk_app, ovpk_m, ivpk_m, recipient, preimage);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| randomness | Field |
| event_type_id | Field |
| ovsk_app | Field |
| ovpk_m | Point |
| ivpk_m | Point |
| recipient | AztecAddress |
| preimage | [Field; N] |

### emit_unencrypted_log_oracle_private

```rust
emit_unencrypted_log_oracle_private(_contract_address, _message, _counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| _contract_address | AztecAddress |
| _message | T |
| _counter | u32 |

### emit_unencrypted_log_private_internal

```rust
emit_unencrypted_log_private_internal(contract_address, message, counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| message | T |
| counter | u32 |

### emit_contract_class_unencrypted_log_private

```rust
emit_contract_class_unencrypted_log_private(contract_address, message, counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| message | [Field; N] |
| counter | u32 |

### emit_contract_class_unencrypted_log_private_internal

```rust
emit_contract_class_unencrypted_log_private_internal(contract_address, message, counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| message | [Field; N] |
| counter | u32 |

