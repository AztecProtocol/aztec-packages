## Standalone Functions

### reset

```rust
reset();
```

Takes no parameters.

### get_side_effects_counter

```rust
get_side_effects_counter();
```

Takes no parameters.

### get_contract_address

```rust
get_contract_address();
```

Takes no parameters.

### set_contract_address

```rust
set_contract_address(address);
```

#### Parameters
| Name | Type |
| --- | --- |
| address | AztecAddress |

### advance_blocks_by

```rust
advance_blocks_by(blocks);
```

#### Parameters
| Name | Type |
| --- | --- |
| blocks | u32 |

### get_private_context_inputs

```rust
get_private_context_inputs(historical_block_number, );
```

#### Parameters
| Name | Type |
| --- | --- |
| historical_block_number | u32 |
|  |  |

### deploy

```rust
deploy(path, name, initializer, args, secret, );
```

#### Parameters
| Name | Type |
| --- | --- |
| path | str&lt;N&gt; |
| name | str&lt;M&gt; |
| initializer | str&lt;P&gt; |
| args | [Field] |
| secret | Field |
|  |  |

### direct_storage_write

```rust
direct_storage_write(contract_address, storage_slot, fields, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| storage_slot | Field |
| fields | [Field; N] |
|  |  |

### create_account

```rust
create_account(secret);
```

#### Parameters
| Name | Type |
| --- | --- |
| secret | Field |

### add_account

```rust
add_account(secret);
```

#### Parameters
| Name | Type |
| --- | --- |
| secret | Field |

### derive_keys

```rust
derive_keys(secret);
```

#### Parameters
| Name | Type |
| --- | --- |
| secret | Field |

### add_authwit

```rust
add_authwit(address, message_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| address | AztecAddress |
| message_hash | Field |

### assert_public_call_fails

```rust
assert_public_call_fails(target_address, function_selector, args, );
```

#### Parameters
| Name | Type |
| --- | --- |
| target_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field] |
|  |  |

### assert_private_call_fails

```rust
assert_private_call_fails(target_address, function_selector, argsHash, sideEffectsCounter, isStaticCall, );
```

#### Parameters
| Name | Type |
| --- | --- |
| target_address | AztecAddress |
| function_selector | FunctionSelector |
| argsHash | Field |
| sideEffectsCounter | Field |
| isStaticCall | bool |
|  |  |

### private_call_new_flow

```rust
private_call_new_flow(from, contract_address, function_selector, args, args_hash, is_static_call, );
```

#### Parameters
| Name | Type |
| --- | --- |
| from | AztecAddress |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field] |
| args_hash | Field |
| is_static_call | bool |
|  |  |

### disable_oracles

```rust
disable_oracles();
```

Takes no parameters.

### enable_oracles

```rust
enable_oracles();
```

Takes no parameters.

### oracle_reset

```rust
oracle_reset();
```

Takes no parameters.

### oracle_set_contract_address

```rust
oracle_set_contract_address(address);
```

#### Parameters
| Name | Type |
| --- | --- |
| address | AztecAddress |

### oracle_get_contract_address

```rust
oracle_get_contract_address();
```

Takes no parameters.

### oracle_get_side_effects_counter

```rust
oracle_get_side_effects_counter();
```

Takes no parameters.

### oracle_advance_blocks_by

```rust
oracle_advance_blocks_by(blocks);
```

#### Parameters
| Name | Type |
| --- | --- |
| blocks | u32 |

### oracle_get_private_context_inputs

```rust
oracle_get_private_context_inputs(historical_block_number, );
```

#### Parameters
| Name | Type |
| --- | --- |
| historical_block_number | u32 |
|  |  |

### oracle_deploy

```rust
oracle_deploy(path, name, initializer, args, secret, );
```

#### Parameters
| Name | Type |
| --- | --- |
| path | str&lt;N&gt; |
| name | str&lt;M&gt; |
| initializer | str&lt;P&gt; |
| args | [Field] |
| secret | Field |
|  |  |

### direct_storage_write_oracle

```rust
direct_storage_write_oracle(_contract_address, _storage_slot, _values, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _contract_address | AztecAddress |
| _storage_slot | Field |
| _values | [Field; N] |
|  |  |

### oracle_create_account

```rust
oracle_create_account(secret);
```

#### Parameters
| Name | Type |
| --- | --- |
| secret | Field |

### oracle_add_account

```rust
oracle_add_account(secret);
```

#### Parameters
| Name | Type |
| --- | --- |
| secret | Field |

### oracle_derive_keys

```rust
oracle_derive_keys(secret);
```

#### Parameters
| Name | Type |
| --- | --- |
| secret | Field |

### oracle_add_authwit

```rust
oracle_add_authwit(address, message_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| address | AztecAddress |
| message_hash | Field |

### oracle_assert_public_call_fails

```rust
oracle_assert_public_call_fails(target_address, function_selector, args, );
```

#### Parameters
| Name | Type |
| --- | --- |
| target_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field] |
|  |  |

### oracle_assert_private_call_fails

```rust
oracle_assert_private_call_fails(target_address, function_selector, argsHash, sideEffectsCounter, isStaticCall, );
```

#### Parameters
| Name | Type |
| --- | --- |
| target_address | AztecAddress |
| function_selector | FunctionSelector |
| argsHash | Field |
| sideEffectsCounter | Field |
| isStaticCall | bool |
|  |  |

### oracle_private_call_new_flow

```rust
oracle_private_call_new_flow(_from, _contract_address, _function_selector, _args, _args_hash, _is_static_call, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _from | AztecAddress |
| _contract_address | AztecAddress |
| _function_selector | FunctionSelector |
| _args | [Field] |
| _args_hash | Field |
| _is_static_call | bool |
|  |  |

### oracle_disable_oracles

```rust
oracle_disable_oracles();
```

Takes no parameters.

### oracle_enable_oracles

```rust
oracle_enable_oracles();
```

Takes no parameters.

