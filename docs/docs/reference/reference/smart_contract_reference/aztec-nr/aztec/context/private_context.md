# PrivateContext

When finished, one can call .finish() to convert back to the abi

## Fields
| Field | Type |
| --- | --- |
| inputs | PrivateContextInputs |
| side_effect_counter | u32 |
| min_revertible_side_effect_counter | u32 |
| args_hash | Field |
| return_hash | Field |
| max_block_number | MaxBlockNumber |
| note_hash_read_requests | BoundedVec&lt;ReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL&gt; |
| nullifier_read_requests | BoundedVec&lt;ReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_CALL&gt; |
| nullifier_key_validation_requests | BoundedVec&lt;NullifierKeyValidationRequest, MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_CALL&gt; |
| new_note_hashes | BoundedVec&lt;NoteHash, MAX_NEW_NOTE_HASHES_PER_CALL&gt; |
| new_nullifiers | BoundedVec&lt;Nullifier, MAX_NEW_NULLIFIERS_PER_CALL&gt; |
| private_call_stack_hashes  | BoundedVec&lt;Field, MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL&gt; |
| public_call_stack_hashes  | BoundedVec&lt;Field, MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL&gt; |
| public_teardown_function_hash | Field |
| new_l2_to_l1_msgs  | BoundedVec&lt;L2ToL1Message, MAX_NEW_L2_TO_L1_MSGS_PER_CALL&gt; |
| historical_header | Header |
| encrypted_logs_hashes | BoundedVec&lt;SideEffect, MAX_ENCRYPTED_LOGS_PER_CALL&gt; |
| unencrypted_logs_hashes | BoundedVec&lt;SideEffect, MAX_UNENCRYPTED_LOGS_PER_CALL&gt; |
| encrypted_log_preimages_length | Field |
| unencrypted_log_preimages_length | Field |
| nullifier_key | Option&lt;NullifierKeys&gt; |

## Methods

### new

```rust
PrivateContext::new(inputs, args_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| inputs | PrivateContextInputs |
| args_hash | Field |

### get_header

Returns the header of a block whose state is used during private execution (not the block the transaction is included in).

```rust
PrivateContext::get_header(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_header_at

Returns the header of an arbitrary block whose block number is less than or equal to the block number of historical header.

```rust
PrivateContext::get_header_at(self, block_number);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| block_number | u32 |

### set_return_hash

```rust
PrivateContext::set_return_hash(&mut self, returns_hasher);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| returns_hasher | ArgsHasher |

### finish

```rust
PrivateContext::finish(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### end_setup

```rust
PrivateContext::end_setup(&mut self);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |

### set_tx_max_block_number

```rust
PrivateContext::set_tx_max_block_number(&mut self, max_block_number);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| max_block_number | u32 |

### push_note_hash_read_request

```rust
PrivateContext::push_note_hash_read_request(&mut self, note_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| note_hash | Field |

### push_nullifier_read_request

```rust
PrivateContext::push_nullifier_read_request(&mut self, nullifier);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| nullifier | Field |

### request_app_nullifier_secret_key

```rust
PrivateContext::request_app_nullifier_secret_key(&mut self, account);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| account | AztecAddress |

### message_portal

```rust
PrivateContext::message_portal(&mut self, recipient, content);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| recipient | EthAddress |
| content | Field |

### consume_l1_to_l2_message

```rust
PrivateContext::consume_l1_to_l2_message(&mut self, content, secret, sender);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| content | Field |
| secret | Field |
| sender | EthAddress |

### emit_unencrypted_log

TODO: We might want to remove this since emitting unencrypted logs from private functions is violating privacy. --&gt; might be a better approach to force devs to make a public function call that emits the log if needed then it would be less easy to accidentally leak information. If we decide to keep this function around would make sense to wait for traits and then merge it with emit_unencrypted_log.

```rust
PrivateContext::emit_unencrypted_log(&mut self, log);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| log | T |

### emit_contract_class_unencrypted_log

This fn exists separately from emit_unencrypted_log because sha hashing the preimage is too large to compile (16,200 fields, 518,400 bytes) =&gt; the oracle hashes it It is ONLY used with contract_class_registerer_contract since we already assert correctness: - Contract class -&gt; we will commit to the packed bytecode (currently a TODO) - Private function -&gt; we provide a membership proof - Unconstrained function -&gt; we provide a membership proof Ordinary logs are not protected by the above so this fn shouldn't be called by anything else

```rust
PrivateContext::emit_contract_class_unencrypted_log(&mut self, log);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| log | [Field; N] |

### emit_encrypted_log

```rust
PrivateContext::emit_encrypted_log(&mut self, contract_address, storage_slot, note_type_id, encryption_pub_key, preimage);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| storage_slot | Field |
| note_type_id | Field |
| encryption_pub_key | GrumpkinPoint |
| preimage | [Field; N] |

### call_private_function

```rust
PrivateContext::call_private_function(&mut self, contract_address, function_selector, args);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field; ARGS_COUNT] |

### static_call_private_function

```rust
PrivateContext::static_call_private_function(&mut self, contract_address, function_selector, args);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field; ARGS_COUNT] |

### delegate_call_private_function

```rust
PrivateContext::delegate_call_private_function(&mut self, contract_address, function_selector, args);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field; ARGS_COUNT] |

### call_private_function_no_args

```rust
PrivateContext::call_private_function_no_args(&mut self, contract_address, function_selector);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |

### static_call_private_function_no_args

```rust
PrivateContext::static_call_private_function_no_args(&mut self, contract_address, function_selector);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |

### delegate_call_private_function_no_args

```rust
PrivateContext::delegate_call_private_function_no_args(&mut self, contract_address, function_selector);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |

### call_private_function_with_packed_args

```rust
PrivateContext::call_private_function_with_packed_args(&mut self, contract_address, function_selector, args_hash, is_static_call, is_delegate_call);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args_hash | Field |
| is_static_call | bool |
| is_delegate_call | bool |

### call_public_function

```rust
PrivateContext::call_public_function(&mut self, contract_address, function_selector, args);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field; ARGS_COUNT] |

### static_call_public_function

```rust
PrivateContext::static_call_public_function(&mut self, contract_address, function_selector, args);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field; ARGS_COUNT] |

### delegate_call_public_function

```rust
PrivateContext::delegate_call_public_function(&mut self, contract_address, function_selector, args);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field; ARGS_COUNT] |

### call_public_function_no_args

```rust
PrivateContext::call_public_function_no_args(&mut self, contract_address, function_selector);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |

### static_call_public_function_no_args

```rust
PrivateContext::static_call_public_function_no_args(&mut self, contract_address, function_selector);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |

### delegate_call_public_function_no_args

```rust
PrivateContext::delegate_call_public_function_no_args(&mut self, contract_address, function_selector);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |

### call_public_function_with_packed_args

```rust
PrivateContext::call_public_function_with_packed_args(&mut self, contract_address, function_selector, args_hash, is_static_call, is_delegate_call);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args_hash | Field |
| is_static_call | bool |
| is_delegate_call | bool |

### set_public_teardown_function

```rust
PrivateContext::set_public_teardown_function(&mut self, contract_address, function_selector, args);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field; ARGS_COUNT] |

### set_public_teardown_function_with_packed_args

```rust
PrivateContext::set_public_teardown_function_with_packed_args(&mut self, contract_address, function_selector, args_hash, is_static_call, is_delegate_call);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args_hash | Field |
| is_static_call | bool |
| is_delegate_call | bool |

### validate_call_stack_item_from_oracle

```rust
PrivateContext::validate_call_stack_item_from_oracle(self, item, contract_address, function_selector, args_hash, is_static_call, is_delegate_call);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| item | PublicCallStackItem |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args_hash | Field |
| is_static_call | bool |
| is_delegate_call | bool |

### next_counter

```rust
PrivateContext::next_counter(&mut self);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |

# PackedReturns

## Fields
| Field | Type |
| --- | --- |
| packed_returns | Field |

## Methods

### new

```rust
PackedReturns::new(packed_returns);
```

#### Parameters
| Name | Type |
| --- | --- |
| packed_returns | Field |

### assert_empty

```rust
PackedReturns::assert_empty(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### raw

```rust
PackedReturns::raw(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### unpack

```rust
PackedReturns::unpack(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### unpack_into

```rust
PackedReturns::unpack_into(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

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
push_new_nullifier(&mut self, nullifier, nullified_note_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| nullifier | Field |
| nullified_note_hash | Field |

### empty

```rust
empty();
```

Takes no parameters.

### emit_unencrypted_log_oracle_private

```rust
emit_unencrypted_log_oracle_private(_contract_address, _event_selector, _message, _counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| _contract_address | AztecAddress |
| _event_selector | Field |
| _message | T |
| _counter | u32 |

### emit_unencrypted_log_private_internal

```rust
emit_unencrypted_log_private_internal(contract_address, event_selector, message, counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| event_selector | Field |
| message | T |
| counter | u32 |

### emit_contract_class_unencrypted_log_private

```rust
emit_contract_class_unencrypted_log_private(contract_address, event_selector, message, counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| event_selector | Field |
| message | [Field; N] |
| counter | u32 |

### emit_contract_class_unencrypted_log_private_internal

```rust
emit_contract_class_unencrypted_log_private_internal(contract_address, event_selector, message, counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| event_selector | Field |
| message | [Field; N] |
| counter | u32 |

