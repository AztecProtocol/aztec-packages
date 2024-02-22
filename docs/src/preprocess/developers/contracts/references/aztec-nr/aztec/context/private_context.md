# PrivateContext

When finished, one can call .finish() to convert back to the abi

## Fields
| Field | Type |
| --- | --- |
| inputs | PrivateContextInputs |
| side_effect_counter | u32 |
| min_revertible_side_effect_counter | u32 |
| args_hash  | Field |
| return_values  | BoundedVec&lt;Field, RETURN_VALUES_LENGTH&gt; |
| read_requests | BoundedVec&lt;SideEffect, MAX_READ_REQUESTS_PER_CALL&gt; |
| nullifier_key_validation_requests | BoundedVec&lt;NullifierKeyValidationRequest, MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_CALL&gt; |
| new_commitments | BoundedVec&lt;SideEffect, MAX_NEW_COMMITMENTS_PER_CALL&gt; |
| new_nullifiers | BoundedVec&lt;SideEffectLinkedToNoteHash, MAX_NEW_NULLIFIERS_PER_CALL&gt; |
| private_call_stack_hashes  | BoundedVec&lt;Field, MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL&gt; |
| public_call_stack_hashes  | BoundedVec&lt;Field, MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL&gt; |
| new_l2_to_l1_msgs  | BoundedVec&lt;L2ToL1Message, MAX_NEW_L2_TO_L1_MSGS_PER_CALL&gt; |
| historical_header | Header |
| nullifier_key | Option&lt;NullifierKeyPair&gt; |

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

#### Returns
| Type |
| --- |
| PrivateContext |

### msg_sender

```rust
PrivateContext::msg_sender(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| AztecAddress |

### this_address

```rust
PrivateContext::this_address(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| AztecAddress |

### this_portal_address

```rust
PrivateContext::this_portal_address(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| EthAddress |

### chain_id

```rust
PrivateContext::chain_id(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Field |

### version

```rust
PrivateContext::version(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Field |

### selector

```rust
PrivateContext::selector(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| FunctionSelector |

### get_header

Returns the header of a block whose state is used during private execution (not the block the transaction is included in).

```rust
PrivateContext::get_header(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Header |

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

#### Returns
| Type |
| --- |
| Header |

### finish

```rust
PrivateContext::finish(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| PrivateCircuitPublicInputs |

### capture_min_revertible_side_effect_counter

```rust
PrivateContext::capture_min_revertible_side_effect_counter(&mut self);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |

### push_read_request

```rust
PrivateContext::push_read_request(&mut self, read_request);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| read_request | Field |

### push_new_note_hash

```rust
PrivateContext::push_new_note_hash(&mut self, note_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| note_hash | Field |

### push_new_nullifier

```rust
PrivateContext::push_new_nullifier(&mut self, nullifier, nullified_commitment);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| nullifier | Field |
| nullified_commitment | Field |

### request_nullifier_secret_key

```rust
PrivateContext::request_nullifier_secret_key(&mut self, account);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| account | AztecAddress |

#### Returns
| Type |
| --- |
| GrumpkinPrivateKey |

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
PrivateContext::consume_l1_to_l2_message(&mut self, msg_key, content, secret, sender);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| msg_key | Field |
| content | Field |
| secret | Field |
| sender | EthAddress |

## Standalone Functions

### accumulate_encrypted_logs

```rust
accumulate_encrypted_logs(&mut self, log);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| log | [Field; N] |

### accumulate_unencrypted_logs

```rust
accumulate_unencrypted_logs(&mut self, log);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| log | T |

