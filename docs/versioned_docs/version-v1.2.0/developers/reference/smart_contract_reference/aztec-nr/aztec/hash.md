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

Computes the hash of input arguments or return values for private functions, or for authwit creation.

#### Parameters
| Name | Type |
| --- | --- |
| args | [Field; N] |

### hash_args

```rust
hash_args(args);
```

Same as `hash_args_array`, but takes a slice instead of an array.

#### Parameters
| Name | Type |
| --- | --- |
| args | [Field] |

### hash_calldata_array

```rust
hash_calldata_array(calldata);
```

Computes the hash of calldata for public functions.

#### Parameters
| Name | Type |
| --- | --- |
| calldata | [Field; N] |

### hash_calldata

```rust
hash_calldata(calldata);
```

Same as `hash_calldata_array`, but takes a slice instead of an array.

#### Parameters
| Name | Type |
| --- | --- |
| calldata | [Field] |

### compute_public_bytecode_commitment

```rust
compute_public_bytecode_commitment(mut packed_public_bytecode, );
```

#### Parameters
| Name | Type |
| --- | --- |
| mut packed_public_bytecode | [Field; MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS] |
|  |  |

### compute_var_args_hash

```rust
compute_var_args_hash();
```

Takes no parameters.

