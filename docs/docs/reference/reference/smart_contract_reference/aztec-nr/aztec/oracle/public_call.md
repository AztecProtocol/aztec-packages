## Standalone Functions

### call_public_function_oracle

```rust
call_public_function_oracle(_contract_address, _function_selector, _args_hash, _side_effect_counter, _is_static_call, _is_delegate_call);
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

### call_public_function_internal

```rust
call_public_function_internal(contract_address, function_selector, args_hash, side_effect_counter, is_static_call, is_delegate_call);
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

