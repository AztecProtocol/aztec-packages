# ArgsHasher

## Fields
| Field | Type |
| --- | --- |
| fields | Field] |

## Methods

### new

```rust
ArgsHasher::new();
```

Takes no parameters.

### add

```rust
ArgsHasher::add(&mut self, field);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| field | Field |

### add_multiple

```rust
ArgsHasher::add_multiple(&mut self, fields);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| fields | [Field; N] |

## Standalone Functions

### compute_secret_hash

```rust
compute_secret_hash(secret);
```

#### Parameters
| Name | Type |
| --- | --- |
| secret | Field |

### compute_encrypted_log_hash

```rust
compute_encrypted_log_hash(encrypted_log);
```

#### Parameters
| Name | Type |
| --- | --- |
| encrypted_log | [Field; M] |

### compute_unencrypted_log_hash

```rust
compute_unencrypted_log_hash(contract_address, event_selector, log);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| event_selector | Field |
| log | T |

### compute_message_hash

```rust
compute_message_hash(sender, chain_id, recipient, version, content, secret_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| sender | EthAddress |
| chain_id | Field |
| recipient | AztecAddress |
| version | Field |
| content | Field |
| secret_hash | Field |

### compute_message_nullifier

```rust
compute_message_nullifier(message_hash, secret, leaf_index);
```

in the L1 to L2 message tree

#### Parameters
| Name | Type |
| --- | --- |
| message_hash | Field |
| secret | Field |
| leaf_index | Field |

### compute_siloed_nullifier

```rust
compute_siloed_nullifier(address, nullifier);
```

#### Parameters
| Name | Type |
| --- | --- |
| address | AztecAddress |
| nullifier | Field |

### hash

```rust
hash(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### hash_args_array

```rust
hash_args_array(args);
```

#### Parameters
| Name | Type |
| --- | --- |
| args | [Field; N] |

### hash_args

```rust
hash_args(args);
```

#### Parameters
| Name | Type |
| --- | --- |
| args | [Field] |

### compute_var_args_hash

```rust
compute_var_args_hash();
```

Takes no parameters.

### compute_enc_log_hash_304

```rust
compute_enc_log_hash_304();
```

Takes no parameters.

### compute_enc_log_hash_368

```rust
compute_enc_log_hash_368();
```

Takes no parameters.

### compute_unenc_log_hash_array

```rust
compute_unenc_log_hash_array();
```

Takes no parameters.

### compute_unenc_log_hash_addr

```rust
compute_unenc_log_hash_addr();
```

Takes no parameters.

### compute_unenc_log_hash_str

```rust
compute_unenc_log_hash_str();
```

Takes no parameters.

### compute_unenc_log_hash_longer_str

```rust
compute_unenc_log_hash_longer_str();
```

Takes no parameters.

