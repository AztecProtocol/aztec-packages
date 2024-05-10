# PublicContext

## Fields
| Field | Type |
| --- | --- |
| inputs | PublicContextInputs |
| side_effect_counter | u32 |
| args_hash  | Field |
| return_hash  | Field |
| nullifier_read_requests | BoundedVec&lt;ReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_CALL&gt; |
| nullifier_non_existent_read_requests | BoundedVec&lt;ReadRequest, MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL&gt; |
| contract_storage_update_requests | BoundedVec&lt;StorageUpdateRequest, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL&gt; |
| contract_storage_reads | BoundedVec&lt;StorageRead, MAX_PUBLIC_DATA_READS_PER_CALL&gt; |
| public_call_stack_hashes | BoundedVec&lt;Field, MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL&gt; |
| new_note_hashes | BoundedVec&lt;NoteHash, MAX_NEW_NOTE_HASHES_PER_CALL&gt; |
| new_nullifiers | BoundedVec&lt;Nullifier, MAX_NEW_NULLIFIERS_PER_CALL&gt; |
| new_l2_to_l1_msgs | BoundedVec&lt;L2ToL1Message, MAX_NEW_L2_TO_L1_MSGS_PER_CALL&gt; |
| unencrypted_logs_hashes | BoundedVec&lt;SideEffect, MAX_UNENCRYPTED_LOGS_PER_CALL&gt; |
| unencrypted_log_preimages_length | Field |
| historical_header | Header |
| prover_address | AztecAddress |

## Methods

### new

```rust
PublicContext::new(inputs, args_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| inputs | PublicContextInputs |
| args_hash | Field |

### call_public_function_no_args

```rust
PublicContext::call_public_function_no_args(self, contract_address, function_selector);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | &mut Self |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |

### static_call_public_function_no_args

```rust
PublicContext::static_call_public_function_no_args(self, contract_address, function_selector);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | &mut Self |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |

### delegate_call_public_function_no_args

```rust
PublicContext::delegate_call_public_function_no_args(self, contract_address, function_selector);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | &mut Self |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |

### call_public_function_with_packed_args

```rust
PublicContext::call_public_function_with_packed_args(self, contract_address, function_selector, args_hash, is_static_call, is_delegate_call);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | &mut Self |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args_hash | Field |
| is_static_call | bool |
| is_delegate_call | bool |

### set_return_hash

```rust
PublicContext::set_return_hash(&mut self, returns_hasher);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| returns_hasher | ArgsHasher |

### push_nullifier_read_request

Keep private or ask the AVM team if you want to change it.

```rust
PublicContext::push_nullifier_read_request(&mut self, nullifier);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| nullifier | Field |

### push_nullifier_non_existent_read_request

Keep private or ask the AVM team if you want to change it.

```rust
PublicContext::push_nullifier_non_existent_read_request(&mut self, nullifier);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| nullifier | Field |

### finish

```rust
PublicContext::finish(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### next_counter

```rust
PublicContext::next_counter(&mut self);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |

## Standalone Functions

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
push_new_nullifier(&mut self, nullifier, _nullified_note_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| nullifier | Field |
| _nullified_note_hash | Field |

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

### fee_per_da_gas

```rust
fee_per_da_gas(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### fee_per_l2_gas

```rust
fee_per_l2_gas(self);
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

### consume_l1_to_l2_message

```rust
consume_l1_to_l2_message(&mut self, content, secret, sender, _leaf_index);
```

Leaf index is not used in public context, but it is used in the AVMContext which will replace it.

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| content | Field |
| secret | Field |
| sender | EthAddress |
| _leaf_index | Field |

### emit_unencrypted_log

```rust
emit_unencrypted_log(&mut self, log);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| log | T |

### call_public_function

```rust
call_public_function(self, contract_address, function_selector, args, _gas);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | &mut Self |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field] |
| _gas | GasOpts |

### static_call_public_function

```rust
static_call_public_function(self, contract_address, function_selector, args, _gas);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | &mut Self |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field] |
| _gas | GasOpts |

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

### empty

```rust
empty();
```

Takes no parameters.

### nullifier_exists_oracle

```rust
nullifier_exists_oracle(nullifier);
```

#### Parameters
| Name | Type |
| --- | --- |
| nullifier | Field |

### emit_unencrypted_log_oracle

```rust
emit_unencrypted_log_oracle(_contract_address, _event_selector, _message, _counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| _contract_address | AztecAddress |
| _event_selector | Field |
| _message | T |
| _counter | u32 |

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

