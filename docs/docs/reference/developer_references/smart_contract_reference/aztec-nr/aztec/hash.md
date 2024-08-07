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

### compute_unencrypted_log_hash

```rust
compute_unencrypted_log_hash(contract_address, log);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
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

