## Standalone Functions

### new

```rust
new(pre, post, block_of_change);
```

#### Parameters
| Name | Type |
| --- | --- |
| pre | Option&lt;u32&gt; |
| post | Option&lt;u32&gt; |
| block_of_change | u32 |

### get_current

```rust
get_current(self, current_block_number);
```

/ historical private reads use `get_effective_minimum_delay_at` instead.

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| current_block_number | u32 |

### get_scheduled

```rust
get_scheduled(self);
```

/ Additionally, further changes might be later scheduled, potentially canceling the one returned by this function.

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### schedule_change

```rust
schedule_change(&mut self, new, current_block_number);
```

/    days.

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| new | u32 |
| current_block_number | u32 |

### get_effective_minimum_delay_at

```rust
get_effective_minimum_delay_at(self, historical_block_number);
```

/ the current one.

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| historical_block_number | u32 |

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
| input | [Field; 1] |

### assert_equal_after_conversion

```rust
assert_equal_after_conversion(original);
```

#### Parameters
| Name | Type |
| --- | --- |
| original | ScheduledDelayChange&lt;TEST_INITIAL_DELAY&gt; |

### test_serde

```rust
test_serde();
```

Takes no parameters.

### test_serde_large_values

```rust
test_serde_large_values();
```

Takes no parameters.

### get_non_initial_delay_change

```rust
get_non_initial_delay_change(pre, post, block_of_change);
```

#### Parameters
| Name | Type |
| --- | --- |
| pre | u32 |
| post | u32 |
| block_of_change | u32 |

### get_initial_delay_change

```rust
get_initial_delay_change();
```

Takes no parameters.

### test_get_current

```rust
test_get_current();
```

Takes no parameters.

### test_get_current_initial

```rust
test_get_current_initial();
```

Takes no parameters.

### test_get_scheduled

```rust
test_get_scheduled();
```

Takes no parameters.

### test_get_scheduled_initial

```rust
test_get_scheduled_initial();
```

Takes no parameters.

### test_schedule_change_to_shorter_delay_before_change

```rust
test_schedule_change_to_shorter_delay_before_change();
```

Takes no parameters.

### test_schedule_change_to_shorter_delay_after_change

```rust
test_schedule_change_to_shorter_delay_after_change();
```

Takes no parameters.

### test_schedule_change_to_shorter_delay_from_initial

```rust
test_schedule_change_to_shorter_delay_from_initial();
```

Takes no parameters.

### test_schedule_change_to_longer_delay_before_change

```rust
test_schedule_change_to_longer_delay_before_change();
```

Takes no parameters.

### test_schedule_change_to_longer_delay_after_change

```rust
test_schedule_change_to_longer_delay_after_change();
```

Takes no parameters.

### test_schedule_change_to_longer_delay_from_initial

```rust
test_schedule_change_to_longer_delay_from_initial();
```

Takes no parameters.

### assert_effective_minimum_delay_invariants

```rust
assert_effective_minimum_delay_invariants(delay_change, historical_block_number, effective_minimum_delay);
```

#### Parameters
| Name | Type |
| --- | --- |
| delay_change | &mut ScheduledDelayChange&lt;INITIAL_DELAY&gt; |
| historical_block_number | u32 |
| effective_minimum_delay | u32 |

### test_get_effective_delay_at_before_change_in_far_future

```rust
test_get_effective_delay_at_before_change_in_far_future();
```

Takes no parameters.

### test_get_effective_delay_at_before_change_to_long_delay

```rust
test_get_effective_delay_at_before_change_to_long_delay();
```

Takes no parameters.

### test_get_effective_delay_at_before_near_change_to_short_delay

```rust
test_get_effective_delay_at_before_near_change_to_short_delay();
```

Takes no parameters.

### test_get_effective_delay_at_after_change

```rust
test_get_effective_delay_at_after_change();
```

Takes no parameters.

### test_get_effective_delay_at_initial

```rust
test_get_effective_delay_at_initial();
```

Takes no parameters.

