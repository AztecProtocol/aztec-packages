# PrivateContext

When finished, one can call .finish() to convert back to the abi

## Fields
| Field | Type |
| --- | --- |
| pub inputs | PrivateContextInputs |
| pub side_effect_counter | u32 |
| pub min_revertible_side_effect_counter | u32 |
| pub is_fee_payer | bool |
| pub args_hash | Field |
| pub return_hash | Field |
| pub max_block_number | MaxBlockNumber |
| pub note_hash_read_requests | BoundedVec&lt;ReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL&gt; |
| pub nullifier_read_requests | BoundedVec&lt;ReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_CALL&gt; |
| key_validation_requests_and_generators | BoundedVec&lt;KeyValidationRequestAndGenerator, MAX_KEY_VALIDATION_REQUESTS_PER_CALL&gt; |
| pub note_hashes | BoundedVec&lt;NoteHash, MAX_NOTE_HASHES_PER_CALL&gt; |
| pub nullifiers | BoundedVec&lt;Nullifier, MAX_NULLIFIERS_PER_CALL&gt; |
| pub private_call_requests | BoundedVec&lt;PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL&gt; |
| pub public_call_requests | BoundedVec&lt;Counted&lt;PublicCallRequest&gt;, MAX_ENQUEUED_CALLS_PER_CALL&gt; |
| pub public_teardown_call_request | PublicCallRequest |
| pub l2_to_l1_msgs | BoundedVec&lt;L2ToL1Message, MAX_L2_TO_L1_MSGS_PER_CALL&gt; |
| pub historical_header | BlockHeader |
| pub private_logs | BoundedVec&lt;PrivateLogData, MAX_PRIVATE_LOGS_PER_CALL&gt; |
| pub contract_class_logs_hashes | BoundedVec&lt;LogHash, MAX_CONTRACT_CLASS_LOGS_PER_CALL&gt; |
| pub last_key_validation_requests | Option&lt;KeyValidationRequest&gt;; NUM_KEY_TYPES] |

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

### msg_sender

```rust
PrivateContext::msg_sender(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### this_address

```rust
PrivateContext::this_address(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### chain_id

```rust
PrivateContext::chain_id(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### version

```rust
PrivateContext::version(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### selector

```rust
PrivateContext::selector(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_args_hash

```rust
PrivateContext::get_args_hash(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### push_note_hash

```rust
PrivateContext::push_note_hash(&mut self, note_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| note_hash | Field |

### push_nullifier

```rust
PrivateContext::push_nullifier(&mut self, nullifier);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| nullifier | Field |

### push_nullifier_for_note_hash

```rust
PrivateContext::push_nullifier_for_note_hash(&mut self, nullifier, nullified_note_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| nullifier | Field |
| nullified_note_hash | Field |

### get_block_header

Returns the header of a block whose state is used during private execution (not the block the transaction is included in).

```rust
PrivateContext::get_block_header(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_block_header_at

Returns the header of an arbitrary block whose block number is less than or equal to the block number of historical header.

```rust
PrivateContext::get_block_header_at(self, block_number);
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

### set_as_fee_payer

```rust
PrivateContext::set_as_fee_payer(&mut self);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |

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

### request_nsk_app

```rust
PrivateContext::request_nsk_app(&mut self, npk_m_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| npk_m_hash | Field |

### request_ovsk_app

```rust
PrivateContext::request_ovsk_app(&mut self, ovpk_m_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| ovpk_m_hash | Field |

### request_sk_app

```rust
PrivateContext::request_sk_app(&mut self, pk_m_hash, key_index);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| pk_m_hash | Field |
| key_index | Field |

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
PrivateContext::consume_l1_to_l2_message(&mut self, content, secret, sender, leaf_index, );
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| content | Field |
| secret | Field |
| sender | EthAddress |
| leaf_index | Field |
|  |  |

### emit_private_log

```rust
PrivateContext::emit_private_log(&mut self, log);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| log | [Field; PRIVATE_LOG_SIZE_IN_FIELDS] |

### emit_raw_note_log

```rust
PrivateContext::emit_raw_note_log(&mut self, log, note_hash_counter, );
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| log | [Field; PRIVATE_LOG_SIZE_IN_FIELDS] |
| note_hash_counter | u32 |
|  |  |

### call_private_function

```rust
PrivateContext::call_private_function(&mut self, contract_address, function_selector, args, );
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field; ARGS_COUNT] |
|  |  |

### static_call_private_function

```rust
PrivateContext::static_call_private_function(&mut self, contract_address, function_selector, args, );
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field; ARGS_COUNT] |
|  |  |

### call_private_function_no_args

```rust
PrivateContext::call_private_function_no_args(&mut self, contract_address, function_selector, );
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
|  |  |

### static_call_private_function_no_args

```rust
PrivateContext::static_call_private_function_no_args(&mut self, contract_address, function_selector, );
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
|  |  |

### call_private_function_with_packed_args

```rust
PrivateContext::call_private_function_with_packed_args(&mut self, contract_address, function_selector, args_hash, is_static_call, );
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args_hash | Field |
| is_static_call | bool |
|  |  |

### call_public_function

```rust
PrivateContext::call_public_function(&mut self, contract_address, function_selector, args, );
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field; ARGS_COUNT] |
|  |  |

### static_call_public_function

```rust
PrivateContext::static_call_public_function(&mut self, contract_address, function_selector, args, );
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field; ARGS_COUNT] |
|  |  |

### call_public_function_no_args

```rust
PrivateContext::call_public_function_no_args(&mut self, contract_address, function_selector, );
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
|  |  |

### static_call_public_function_no_args

```rust
PrivateContext::static_call_public_function_no_args(&mut self, contract_address, function_selector, );
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
|  |  |

### call_public_function_with_packed_args

```rust
PrivateContext::call_public_function_with_packed_args(&mut self, contract_address, function_selector, args_hash, is_static_call, );
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args_hash | Field |
| is_static_call | bool |
|  |  |

### set_public_teardown_function

```rust
PrivateContext::set_public_teardown_function(&mut self, contract_address, function_selector, args, );
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field; ARGS_COUNT] |
|  |  |

### set_public_teardown_function_with_packed_args

```rust
PrivateContext::set_public_teardown_function_with_packed_args(&mut self, contract_address, function_selector, args_hash, is_static_call, );
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args_hash | Field |
| is_static_call | bool |
|  |  |

### next_counter

```rust
PrivateContext::next_counter(&mut self);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |

## Standalone Functions

### empty

```rust
empty();
```

Takes no parameters.

