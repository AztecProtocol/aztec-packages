## Standalone Functions

### test_serde

```rust
test_serde();
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
assert_block_horizon_invariants(value_change, historical_block_number, block_horizon, );
```

#### Parameters
| Name | Type |
| --- | --- |
| value_change | &mut ScheduledValueChange&lt;Field&gt; |
| historical_block_number | u32 |
| block_horizon | u32 |
|  |  |

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

### test_get_block_horizon_n0_delay

```rust
test_get_block_horizon_n0_delay();
```

Takes no parameters.

### test_schedule_change_before_change

```rust
test_schedule_change_before_change();
```

Takes no parameters.

### test_schedule_change_after_change

```rust
test_schedule_change_after_change();
```

Takes no parameters.

### test_schedule_change_no_delay

```rust
test_schedule_change_no_delay();
```

Takes no parameters.

