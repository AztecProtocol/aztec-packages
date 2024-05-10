## Standalone Functions

### enqueue_public_function_call_oracle

```rust
enqueue_public_function_call_oracle(_contract_address, _function_selector, _args_hash, _side_effect_counter, _is_static_call, _is_delegate_call);
```

#### Parameters
| Name | Type |
| --- | --- |
| _contract_address | AztecAddress |
| _function_selector | FunctionSelector |
| _args_hash | Field |
| _side_effect_counter | u32 |
| _is_static_call | bool |
| _is_delegate_call | bool |

### enqueue_public_function_call_internal

```rust
enqueue_public_function_call_internal(contract_address, function_selector, args_hash, side_effect_counter, is_static_call, is_delegate_call);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args_hash | Field |
| side_effect_counter | u32 |
| is_static_call | bool |
| is_delegate_call | bool |

### set_public_teardown_function_call_oracle

```rust
set_public_teardown_function_call_oracle(_contract_address, _function_selector, _args_hash, _side_effect_counter, _is_static_call, _is_delegate_call);
```

#### Parameters
| Name | Type |
| --- | --- |
| _contract_address | AztecAddress |
| _function_selector | FunctionSelector |
| _args_hash | Field |
| _side_effect_counter | u32 |
| _is_static_call | bool |
| _is_delegate_call | bool |

### set_public_teardown_function_call_internal

```rust
set_public_teardown_function_call_internal(contract_address, function_selector, args_hash, side_effect_counter, is_static_call, is_delegate_call);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args_hash | Field |
| side_effect_counter | u32 |
| is_static_call | bool |
| is_delegate_call | bool |

### parse_public_call_stack_item_from_oracle

```rust
parse_public_call_stack_item_from_oracle(fields);
```

#### Parameters
| Name | Type |
| --- | --- |
| fields | [Field; ENQUEUE_PUBLIC_FUNCTION_CALL_RETURN_LENGTH] |

