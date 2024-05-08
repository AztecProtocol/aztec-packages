## Standalone Functions

### new

```rust
new(pre, post, block_of_change);
```

#### Parameters
| Name | Type |
| --- | --- |
| pre | T |
| post | T |
| block_of_change | u32 |

### get_current_at

```rust
get_current_at(self, block_number);
```

/ equal to the block horizon (see `get_block_horizon()`).

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| block_number | u32 |

### get_scheduled

```rust
get_scheduled(self);
```

/ Additionally, further changes might be later scheduled, potentially canceling the one returned by this function.

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_block_horizon

```rust
get_block_horizon(self, historical_block_number, minimum_delay);
```

/ using the same historical block number.

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| historical_block_number | u32 |
| minimum_delay | u32 |

### schedule_change

```rust
schedule_change(&mut self, new_value, current_block_number, minimum_delay, block_of_change);
```

/ meaningful when called in public with the current block number.

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| new_value | T |
| current_block_number | u32 |
| minimum_delay | u32 |
| block_of_change | u32 |

### serialize

```rust
serialize(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### deserialize

```rust
deserialize(input);
```

#### Parameters
| Name | Type |
| --- | --- |
| input | [Field; 3] |

### min

```rust
min(lhs, rhs);
```

#### Parameters
| Name | Type |
| --- | --- |
| lhs | u32 |
| rhs | u32 |

### test_min

```rust
test_min();
```

Takes no parameters.

### test_get_current_at

```rust
test_get_current_at();
```

Takes no parameters.

### test_get_scheduled

```rust
test_get_scheduled();
```

Takes no parameters.

### assert_block_horizon_invariants

```rust
assert_block_horizon_invariants(value, historical_block_number, block_horizon);
```

#### Parameters
| Name | Type |
| --- | --- |
| value | &mut ScheduledValueChange&lt;Field&gt; |
| historical_block_number | u32 |
| block_horizon | u32 |

### test_get_block_horizon_change_in_past

```rust
test_get_block_horizon_change_in_past();
```

Takes no parameters.

### test_get_block_horizon_change_in_immediate_past

```rust
test_get_block_horizon_change_in_immediate_past();
```

Takes no parameters.

### test_get_block_horizon_change_in_near_future

```rust
test_get_block_horizon_change_in_near_future();
```

Takes no parameters.

### test_get_block_horizon_change_in_far_future

```rust
test_get_block_horizon_change_in_far_future();
```

Takes no parameters.

### test_schedule_change_before_prior_change

```rust
test_schedule_change_before_prior_change();
```

Takes no parameters.

### test_schedule_change_after_prior_change

```rust
test_schedule_change_after_prior_change();
```

Takes no parameters.

