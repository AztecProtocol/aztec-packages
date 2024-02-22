# PublicContext

## Fields
| Field | Type |
| --- | --- |
| inputs | PublicContextInputs |
| side_effect_counter | u32 |
| args_hash  | Field |
| return_values  | BoundedVec&lt;Field, RETURN_VALUES_LENGTH&gt; |
| contract_storage_update_requests | BoundedVec&lt;StorageUpdateRequest, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL&gt; |
| contract_storage_reads | BoundedVec&lt;StorageRead, MAX_PUBLIC_DATA_READS_PER_CALL&gt; |
| public_call_stack_hashes | BoundedVec&lt;Field, MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL&gt; |
| new_commitments | BoundedVec&lt;SideEffect, MAX_NEW_COMMITMENTS_PER_CALL&gt; |
| new_nullifiers | BoundedVec&lt;SideEffectLinkedToNoteHash, MAX_NEW_NULLIFIERS_PER_CALL&gt; |
| new_l2_to_l1_msgs | BoundedVec&lt;L2ToL1Message, MAX_NEW_L2_TO_L1_MSGS_PER_CALL&gt; |
| unencrypted_logs_hash | BoundedVec&lt;Field, NUM_FIELDS_PER_SHA256&gt; |
| unencrypted_logs_preimages_length | Field |
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

#### Returns
| Type |
| --- |
| PublicContext |

### msg_sender

```rust
PublicContext::msg_sender(self);
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
PublicContext::this_address(self);
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
PublicContext::this_portal_address(self);
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
PublicContext::chain_id(self);
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
PublicContext::version(self);
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
PublicContext::selector(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| FunctionSelector |

### block_number

```rust
PublicContext::block_number(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Field |

### timestamp

```rust
PublicContext::timestamp(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Field |

### coinbase

```rust
PublicContext::coinbase(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| EthAddress |

### fee_recipient

```rust
PublicContext::fee_recipient(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| AztecAddress |

### finish

```rust
PublicContext::finish(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| PublicCircuitPublicInputs |

### push_new_note_hash

```rust
PublicContext::push_new_note_hash(&mut self, note_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| note_hash | Field |

### push_new_nullifier

```rust
PublicContext::push_new_nullifier(&mut self, nullifier, _nullified_commitment);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| nullifier | Field |
| _nullified_commitment | Field |

### message_portal

```rust
PublicContext::message_portal(&mut self, recipient, content);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| recipient | EthAddress |
| content | Field |

### consume_l1_to_l2_message

```rust
PublicContext::consume_l1_to_l2_message(&mut self, msg_key, content, secret, sender);
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

