## Standalone Functions

### aztec

```rust
aztec(m);
```

#### Parameters
| Name | Type |
| --- | --- |
| m | Module |

### generate_contract_interface

```rust
generate_contract_interface(m);
```

#### Parameters
| Name | Type |
| --- | --- |
| m | Module |

### storage_layout

```rust
storage_layout();
```

Takes no parameters.

### at

```rust
at(addr);
```

#### Parameters
| Name | Type |
| --- | --- |
| addr | aztec |

### interface

```rust
interface();
```

Takes no parameters.

### at

```rust
at(addr);
```

#### Parameters
| Name | Type |
| --- | --- |
| addr | aztec |

### interface

```rust
interface();
```

Takes no parameters.

### generate_compute_note_hash_and_optionally_a_nullifier

```rust
generate_compute_note_hash_and_optionally_a_nullifier();
```

Takes no parameters.

### compute_note_hash_and_optionally_a_nullifier

```rust
compute_note_hash_and_optionally_a_nullifier(contract_address, nonce, storage_slot, note_type_id, compute_nullifier, packed_note_content, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | aztec |
| nonce | Field |
| storage_slot | Field |
| note_type_id | Field |
| compute_nullifier | bool |
| packed_note_content | [Field; $max_note_content_length] |
|  |  |

### generate_process_log

```rust
generate_process_log();
```

Takes no parameters.

### process_log

```rust
process_log(log_plaintext, dep, tx_hash, unique_note_hashes_in_tx, dep, first_nullifier_in_tx, recipient, );
```

#### Parameters
| Name | Type |
| --- | --- |
| log_plaintext | BoundedVec&lt;Field |
| dep |  |
| tx_hash | Field |
| unique_note_hashes_in_tx | BoundedVec&lt;Field |
| dep |  |
| first_nullifier_in_tx | Field |
| recipient | aztec |
|  |  |

### generate_note_exports

```rust
generate_note_exports();
```

Takes no parameters.

### generate_sync_notes

```rust
generate_sync_notes();
```

Takes no parameters.

### sync_notes

```rust
sync_notes();
```

Takes no parameters.

