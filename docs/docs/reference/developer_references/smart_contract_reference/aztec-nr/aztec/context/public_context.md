# PublicContext

## Fields
| Field | Type |
| --- | --- |
| inputs | PublicContextInputs |

## Methods

### new

```rust
PublicContext::new(inputs);
```

#### Parameters
| Name | Type |
| --- | --- |
| inputs | PublicContextInputs |

### emit_unencrypted_log

```rust
PublicContext::emit_unencrypted_log(_self, log);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | &mut Self |
| log | T |

### note_hash_exists

```rust
PublicContext::note_hash_exists(_self, note_hash, leaf_index);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| note_hash | Field |
| leaf_index | Field |

### l1_to_l2_msg_exists

```rust
PublicContext::l1_to_l2_msg_exists(_self, msg_hash, msg_leaf_index);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| msg_hash | Field |
| msg_leaf_index | Field |

### nullifier_exists

```rust
PublicContext::nullifier_exists(_self, unsiloed_nullifier, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| unsiloed_nullifier | Field |
| address | AztecAddress |

### consume_l1_to_l2_message

```rust
PublicContext::consume_l1_to_l2_message(&mut self, content, secret, sender, leaf_index);
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
PublicContext::message_portal(_self, recipient, content);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | &mut Self |
| recipient | EthAddress |
| content | Field |

### call_public_function

```rust
PublicContext::call_public_function(_self, contract_address, function_selector, args, gas_opts);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | &mut Self |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field] |
| gas_opts | GasOpts |

### static_call_public_function

```rust
PublicContext::static_call_public_function(_self, contract_address, function_selector, args, gas_opts);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | &mut Self |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field] |
| gas_opts | GasOpts |

### delegate_call_public_function

```rust
PublicContext::delegate_call_public_function(_self, _contract_address, _function_selector, _args);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | &mut Self |
| _contract_address | AztecAddress |
| _function_selector | FunctionSelector |
| _args | [Field] |

### push_note_hash

```rust
PublicContext::push_note_hash(_self, note_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | &mut Self |
| note_hash | Field |

### push_nullifier

```rust
PublicContext::push_nullifier(_self, nullifier);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | &mut Self |
| nullifier | Field |

### this_address

```rust
PublicContext::this_address(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### storage_address

```rust
PublicContext::storage_address(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### msg_sender

```rust
PublicContext::msg_sender(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### selector

```rust
PublicContext::selector(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### get_args_hash

```rust
PublicContext::get_args_hash(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### transaction_fee

```rust
PublicContext::transaction_fee(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### chain_id

```rust
PublicContext::chain_id(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### version

```rust
PublicContext::version(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### block_number

```rust
PublicContext::block_number(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### timestamp

```rust
PublicContext::timestamp(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### fee_per_l2_gas

```rust
PublicContext::fee_per_l2_gas(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### fee_per_da_gas

```rust
PublicContext::fee_per_da_gas(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### l2_gas_left

```rust
PublicContext::l2_gas_left(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### da_gas_left

```rust
PublicContext::da_gas_left(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### raw_storage_read

```rust
PublicContext::raw_storage_read(_self, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| storage_slot | Field |

### storage_read

```rust
PublicContext::storage_read(self, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| storage_slot | Field |

### raw_storage_write

```rust
PublicContext::raw_storage_write(_self, storage_slot, values);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| storage_slot | Field |
| values | [Field; N] |

### storage_write

```rust
PublicContext::storage_write(self, storage_slot, value);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| storage_slot | Field |
| value | T |

## Standalone Functions

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

### function_selector

```rust
function_selector();
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

### emit_nullifier

```rust
emit_nullifier(nullifier);
```

#### Parameters
| Name | Type |
| --- | --- |
| nullifier | Field |

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
call(gas, address, args, function_selector);
```

#### Parameters
| Name | Type |
| --- | --- |
| gas | [Field; 2] |
| address | AztecAddress |
| args | [Field] |
| function_selector | Field |

### call_static

```rust
call_static(gas, address, args, function_selector);
```

#### Parameters
| Name | Type |
| --- | --- |
| gas | [Field; 2] |
| address | AztecAddress |
| args | [Field] |
| function_selector | Field |

### empty

```rust
empty();
```

Takes no parameters.

### address_opcode

```rust
address_opcode();
```

Takes no parameters.

### storage_address_opcode

```rust
storage_address_opcode();
```

Takes no parameters.

### sender_opcode

```rust
sender_opcode();
```

Takes no parameters.

### portal_opcode

```rust
portal_opcode();
```

Takes no parameters.

### function_selector_opcode

```rust
function_selector_opcode();
```

Takes no parameters.

### transaction_fee_opcode

```rust
transaction_fee_opcode();
```

Takes no parameters.

### chain_id_opcode

```rust
chain_id_opcode();
```

Takes no parameters.

### version_opcode

```rust
version_opcode();
```

Takes no parameters.

### block_number_opcode

```rust
block_number_opcode();
```

Takes no parameters.

### timestamp_opcode

```rust
timestamp_opcode();
```

Takes no parameters.

### fee_per_l2_gas_opcode

```rust
fee_per_l2_gas_opcode();
```

Takes no parameters.

### fee_per_da_gas_opcode

```rust
fee_per_da_gas_opcode();
```

Takes no parameters.

### l2_gas_left_opcode

```rust
l2_gas_left_opcode();
```

Takes no parameters.

### da_gas_left_opcode

```rust
da_gas_left_opcode();
```

Takes no parameters.

### note_hash_exists_opcode

```rust
note_hash_exists_opcode(note_hash, leaf_index);
```

#### Parameters
| Name | Type |
| --- | --- |
| note_hash | Field |
| leaf_index | Field |

### emit_note_hash_opcode

```rust
emit_note_hash_opcode(note_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| note_hash | Field |

### nullifier_exists_opcode

```rust
nullifier_exists_opcode(nullifier, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| nullifier | Field |
| address | Field |

### emit_nullifier_opcode

```rust
emit_nullifier_opcode(nullifier);
```

#### Parameters
| Name | Type |
| --- | --- |
| nullifier | Field |

### emit_unencrypted_log_opcode

```rust
emit_unencrypted_log_opcode(message);
```

#### Parameters
| Name | Type |
| --- | --- |
| message | [Field] |

### l1_to_l2_msg_exists_opcode

```rust
l1_to_l2_msg_exists_opcode(msg_hash, msg_leaf_index);
```

#### Parameters
| Name | Type |
| --- | --- |
| msg_hash | Field |
| msg_leaf_index | Field |

### send_l2_to_l1_msg_opcode

```rust
send_l2_to_l1_msg_opcode(recipient, content);
```

#### Parameters
| Name | Type |
| --- | --- |
| recipient | EthAddress |
| content | Field |

### call_opcode

```rust
call_opcode(gas, // gas allocation, da_gas]
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

### call_static_opcode

```rust
call_static_opcode(gas, // gas allocation, da_gas]
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

### storage_read_opcode

```rust
storage_read_opcode(storage_slot, length);
```

#### Parameters
| Name | Type |
| --- | --- |
| storage_slot | Field |
| length | Field |

### storage_write_opcode

```rust
storage_write_opcode(storage_slot, values);
```

#### Parameters
| Name | Type |
| --- | --- |
| storage_slot | Field |
| values | [Field; N] |

### assert_empty

```rust
assert_empty(returns);
```

#### Parameters
| Name | Type |
| --- | --- |
| returns | FunctionReturns&lt;0&gt; |

### raw

```rust
raw(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### deserialize_into

```rust
deserialize_into(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

