# ArgsHasher

## Fields
| Field | Type |
| --- | --- |
| pub fields | Field] |

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

### pedersen_commitment

```rust
pedersen_commitment(inputs, hash_index);
```

#### Parameters
| Name | Type |
| --- | --- |
| inputs | [Field; N] |
| hash_index | u32 |

### compute_secret_hash

```rust
compute_secret_hash(secret);
```

#### Parameters
| Name | Type |
| --- | --- |
| secret | Field |

### compute_unencrypted_log_hash

```rust
compute_unencrypted_log_hash(contract_address, log, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| log | [u8; N] |
|  |  |

### compute_l1_to_l2_message_hash

```rust
compute_l1_to_l2_message_hash(sender, chain_id, recipient, version, content, secret_hash, leaf_index, );
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
| leaf_index | Field |
|  |  |

### compute_l1_to_l2_message_nullifier

```rust
compute_l1_to_l2_message_nullifier(message_hash, secret);
```

The nullifier of a l1 to l2 message is the hash of the message salted with the secret

#### Parameters
| Name | Type |
| --- | --- |
| message_hash | Field |
| secret | Field |

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

