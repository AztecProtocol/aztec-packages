# AvmContext

## Fields
| Field | Type |
| --- | --- |
| inputs | AvmContextInputs |

## Methods

### new

```rust
AvmContext::new(inputs);
```

#### Parameters
| Name | Type |
| --- | --- |
| inputs | AvmContextInputs |

### storage_address

```rust
AvmContext::storage_address(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### fee_per_l2_gas

```rust
AvmContext::fee_per_l2_gas(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### fee_per_da_gas

```rust
AvmContext::fee_per_da_gas(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### emit_unencrypted_log_with_selector

```rust
AvmContext::emit_unencrypted_log_with_selector(&mut self, event_selector, log);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| event_selector | Field |
| log | T |

### note_hash_exists

```rust
AvmContext::note_hash_exists(self, note_hash, leaf_index);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| note_hash | Field |
| leaf_index | Field |

### l1_to_l2_msg_exists

```rust
AvmContext::l1_to_l2_msg_exists(self, msg_hash, msg_leaf_index);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| msg_hash | Field |
| msg_leaf_index | Field |

## Standalone Functions

### block_number

```rust
block_number(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### timestamp

```rust
timestamp(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### coinbase

```rust
coinbase(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### fee_recipient

```rust
fee_recipient(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### transaction_fee

```rust
transaction_fee(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### nullifier_exists

```rust
nullifier_exists(self, unsiloed_nullifier, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| unsiloed_nullifier | Field |
| address | AztecAddress |

### emit_unencrypted_log

```rust
emit_unencrypted_log(&mut self, log);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| log | T |

### consume_l1_to_l2_message

```rust
consume_l1_to_l2_message(&mut self, content, secret, sender, leaf_index);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| content | Field |
| secret | Field |
| sender | EthAddress |
| leaf_index | Field |

### message_portal

```rust
message_portal(&mut self, recipient, content);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| recipient | EthAddress |
| content | Field |

### call_public_function

```rust
call_public_function(self, contract_address, temporary_function_selector, args, gas_opts);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | &mut Self |
| contract_address | AztecAddress |
| temporary_function_selector | FunctionSelector |
| args | [Field] |
| gas_opts | GasOpts |

### static_call_public_function

```rust
static_call_public_function(self, contract_address, temporary_function_selector, args, gas_opts);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | &mut Self |
| contract_address | AztecAddress |
| temporary_function_selector | FunctionSelector |
| args | [Field] |
| gas_opts | GasOpts |

### delegate_call_public_function

```rust
delegate_call_public_function(self, contract_address, function_selector, args);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | &mut Self |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field] |

### push_new_note_hash

```rust
push_new_note_hash(&mut self, note_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| note_hash | Field |

### push_new_nullifier

```rust
push_new_nullifier(&mut self, nullifier, _nullified_commitment);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| nullifier | Field |
| _nullified_commitment | Field |

### msg_sender

```rust
msg_sender(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### this_address

```rust
this_address(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### chain_id

```rust
chain_id(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### version

```rust
version(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### selector

```rust
selector(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_args_hash

```rust
get_args_hash(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### empty

```rust
empty();
```

Takes no parameters.

### gas_for_call

```rust
gas_for_call(user_gas);
```

Helper functions

#### Parameters
| Name | Type |
| --- | --- |
| user_gas | GasOpts |

### address

```rust
address();
```

Takes no parameters.

### sender

```rust
sender();
```

Takes no parameters.

### portal

```rust
portal();
```

Takes no parameters.

### transaction_fee

```rust
transaction_fee();
```

Takes no parameters.

### chain_id

```rust
chain_id();
```

Takes no parameters.

### version

```rust
version();
```

Takes no parameters.

### block_number

```rust
block_number();
```

Takes no parameters.

### timestamp

```rust
timestamp();
```

Takes no parameters.

### l2_gas_left

```rust
l2_gas_left();
```

Takes no parameters.

### da_gas_left

```rust
da_gas_left();
```

Takes no parameters.

### emit_note_hash

```rust
emit_note_hash(note_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| note_hash | Field |

### nullifier_exists

```rust
nullifier_exists(nullifier, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| nullifier | Field |
| address | Field |

### emit_nullifier

```rust
emit_nullifier(nullifier);
```

#### Parameters
| Name | Type |
| --- | --- |
| nullifier | Field |

### emit_unencrypted_log

```rust
emit_unencrypted_log(event_selector, message);
```

#### Parameters
| Name | Type |
| --- | --- |
| event_selector | Field |
| message | T |

### send_l2_to_l1_msg

```rust
send_l2_to_l1_msg(recipient, content);
```

#### Parameters
| Name | Type |
| --- | --- |
| recipient | EthAddress |
| content | Field |

### call

```rust
call(gas, // gas allocation, da_gas]
    address, args, // TODO(5110);
```

#### Parameters
| Name | Type |
| --- | --- |
| gas | [Field; 2] |
| // gas allocation | [l2_gas |
| da_gas]
    address | AztecAddress |
| args | [Field] |
| // TODO(5110 |  |

### call_static

```rust
call_static(gas, // gas allocation, da_gas]
    address, args, // TODO(5110);
```

#### Parameters
| Name | Type |
| --- | --- |
| gas | [Field; 2] |
| // gas allocation | [l2_gas |
| da_gas]
    address | AztecAddress |
| args | [Field] |
| // TODO(5110 |  |

