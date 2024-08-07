## Standalone Functions

### compute_encrypted_event_log

```rust
compute_encrypted_event_log(contract_address, randomness, ovsk_app, ovpk, ivpk, recipient, event);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| randomness | Field |
| ovsk_app | Field |
| ovpk | Point |
| ivpk | Point |
| recipient | AztecAddress |
| event | Event |

### compute_encrypted_note_log

```rust
compute_encrypted_note_log(contract_address, storage_slot, ovsk_app, ovpk, ivpk, recipient, note);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| storage_slot | Field |
| ovsk_app | Field |
| ovpk | Point |
| ivpk | Point |
| recipient | AztecAddress |
| note | Note |

### fr_to_fq

```rust
fr_to_fq(r);
```

/ This is fine because modulus of the base field is smaller than the modulus of the scalar field.

#### Parameters
| Name | Type |
| --- | --- |
| r | Field |

### generate_ephemeral_key_pair

```rust
generate_ephemeral_key_pair();
```

Takes no parameters.

### test_encrypted_note_log_matches_typescript

```rust
test_encrypted_note_log_matches_typescript();
```

Takes no parameters.

