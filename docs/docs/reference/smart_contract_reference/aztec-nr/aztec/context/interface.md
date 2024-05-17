# PrivateVoidCallInterface

## Fields
| Field | Type |
| --- | --- |
| target_contract | AztecAddress |
| selector | FunctionSelector |
| args_hash | Field |

## Methods

### call

```rust
PrivateVoidCallInterface::call(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |

### static_call

```rust
PrivateVoidCallInterface::static_call(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |

### delegate_call

```rust
PrivateVoidCallInterface::delegate_call(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |

# PublicVoidCallInterface

## Fields
| Field | Type |
| --- | --- |
| target_contract | AztecAddress |
| selector | FunctionSelector |
| args_hash | Field |

## Methods

### call

```rust
PublicVoidCallInterface::call(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PublicContext |

### static_call

```rust
PublicVoidCallInterface::static_call(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PublicContext |

### delegate_call

```rust
PublicVoidCallInterface::delegate_call(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PublicContext |

### enqueue

```rust
PublicVoidCallInterface::enqueue(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |

### static_enqueue

```rust
PublicVoidCallInterface::static_enqueue(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |

### delegate_enqueue

```rust
PublicVoidCallInterface::delegate_enqueue(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |

# AvmVoidCallInterface

## Fields
| Field | Type |
| --- | --- |
| target_contract | AztecAddress |
| selector | FunctionSelector |
| args | Field] |
| gas_opts | GasOpts |

## Methods

### with_gas

```rust
AvmVoidCallInterface::with_gas(self, gas_opts);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | &mut Self |
| gas_opts | GasOpts |

### call

```rust
AvmVoidCallInterface::call(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut AvmContext |

### static_call

```rust
AvmVoidCallInterface::static_call(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut AvmContext |

### delegate_call

```rust
AvmVoidCallInterface::delegate_call(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut AvmContext |

### enqueue

```rust
AvmVoidCallInterface::enqueue(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |

### static_enqueue

```rust
AvmVoidCallInterface::static_enqueue(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |

### delegate_enqueue

```rust
AvmVoidCallInterface::delegate_enqueue(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |

## Standalone Functions

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
push_new_nullifier(&mut self, nullifier, nullified_commitment);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| nullifier | Field |
| nullified_commitment | Field |

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
call_public_function(self, contract_address, function_selector, args, gas_opts);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | &mut Self |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args | [Field] |
| gas_opts | GasOpts |

### static_call_public_function

```rust
static_call_public_function(self, contract_address, function_selector, args, gas_opts);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | &mut Self |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
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

