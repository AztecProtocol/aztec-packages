## Standalone Functions

### enqueue_public_function_call_oracle

```rust
enqueue_public_function_call_oracle(_contract_address, _function_selector, _args_hash, _side_effect_counter, _is_static_call, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _contract_address | AztecAddress |
| _function_selector | FunctionSelector |
| _args_hash | Field |
| _side_effect_counter | u32 |
| _is_static_call | bool |
|  |  |

### enqueue_public_function_call_internal

```rust
enqueue_public_function_call_internal(contract_address, function_selector, args_hash, side_effect_counter, is_static_call, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args_hash | Field |
| side_effect_counter | u32 |
| is_static_call | bool |
|  |  |

### set_public_teardown_function_call_oracle

```rust
set_public_teardown_function_call_oracle(_contract_address, _function_selector, _args_hash, _side_effect_counter, _is_static_call, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _contract_address | AztecAddress |
| _function_selector | FunctionSelector |
| _args_hash | Field |
| _side_effect_counter | u32 |
| _is_static_call | bool |
|  |  |

### set_public_teardown_function_call_internal

```rust
set_public_teardown_function_call_internal(contract_address, function_selector, args_hash, side_effect_counter, is_static_call, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| function_selector | FunctionSelector |
| args_hash | Field |
| side_effect_counter | u32 |
| is_static_call | bool |
|  |  |

### notify_set_min_revertible_side_effect_counter

```rust
notify_set_min_revertible_side_effect_counter(counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| counter | u32 |

### notify_set_min_revertible_side_effect_counter_oracle_wrapper

```rust
notify_set_min_revertible_side_effect_counter_oracle_wrapper(counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| counter | u32 |

### notify_set_min_revertible_side_effect_counter_oracle

```rust
notify_set_min_revertible_side_effect_counter_oracle(_counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| _counter | u32 |

