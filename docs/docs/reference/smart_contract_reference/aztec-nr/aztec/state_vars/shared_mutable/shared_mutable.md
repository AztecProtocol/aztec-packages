## Standalone Functions

### new

```rust
new(context, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | Context |
| storage_slot | Field |

### schedule_value_change

```rust
schedule_value_change(self, new_value);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| new_value | T |

### schedule_delay_change

```rust
schedule_delay_change(self, new_delay);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| new_delay | u32 |

### get_current_value_in_public

```rust
get_current_value_in_public(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_current_delay_in_public

```rust
get_current_delay_in_public(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_scheduled_value_in_public

```rust
get_scheduled_value_in_public(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_scheduled_delay_in_public

```rust
get_scheduled_delay_in_public(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_current_value_in_private

```rust
get_current_value_in_private(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### historical_read_from_public_storage

```rust
historical_read_from_public_storage(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | PrivateContext |

### read_value_change

```rust
read_value_change(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### read_delay_change

```rust
read_delay_change(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### write_value_change

```rust
write_value_change(self, value_change);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| value_change | ScheduledValueChange&lt;T&gt; |

### write_delay_change

```rust
write_delay_change(self, delay_change);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| delay_change | ScheduledDelayChange&lt;INITIAL_DELAY&gt; |

### get_value_change_storage_slot

```rust
get_value_change_storage_slot(self);
```

https://github.com/AztecProtocol/aztec-packages/issues/5736

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_delay_change_storage_slot

```rust
get_delay_change_storage_slot(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### setup

```rust
setup(private);
```

#### Parameters
| Name | Type |
| --- | --- |
| private | bool |

### create_context

```rust
create_context(block_number, private);
```

#### Parameters
| Name | Type |
| --- | --- |
| block_number | Field |
| private | bool |

### mock_value_change_read

```rust
mock_value_change_read(state_var, TEST_INITIAL_DELAY>, pre, post, block_of_change);
```

#### Parameters
| Name | Type |
| --- | --- |
| state_var | SharedMutable&lt;Field |
| TEST_INITIAL_DELAY&gt; |  |
| pre | Field |
| post | Field |
| block_of_change | Field |

### mock_delay_change_read

```rust
mock_delay_change_read(state_var, TEST_INITIAL_DELAY>, pre, post, block_of_change);
```

#### Parameters
| Name | Type |
| --- | --- |
| state_var | SharedMutable&lt;Field |
| TEST_INITIAL_DELAY&gt; |  |
| pre | Field |
| post | Field |
| block_of_change | Field |

### mock_delay_change_read_uninitialized

```rust
mock_delay_change_read_uninitialized(state_var, TEST_INITIAL_DELAY>);
```

#### Parameters
| Name | Type |
| --- | --- |
| state_var | SharedMutable&lt;Field |
| TEST_INITIAL_DELAY&gt; |  |

### mock_value_and_delay_read

```rust
mock_value_and_delay_read(state_var, TEST_INITIAL_DELAY>, value_block_of_change, delay_block_of_change);
```

block of change.

#### Parameters
| Name | Type |
| --- | --- |
| state_var | SharedMutable&lt;Field |
| TEST_INITIAL_DELAY&gt; |  |
| value_block_of_change | Field |
| delay_block_of_change | Field |

### mock_value_change_write

```rust
mock_value_change_write();
```

Takes no parameters.

### mock_delay_change_write

```rust
mock_delay_change_write();
```

Takes no parameters.

### assert_value_change_write

```rust
assert_value_change_write(state_var, TEST_INITIAL_DELAY>, mock, pre, post, block_of_change);
```

#### Parameters
| Name | Type |
| --- | --- |
| state_var | SharedMutable&lt;Field |
| TEST_INITIAL_DELAY&gt; |  |
| mock | OracleMock |
| pre | Field |
| post | Field |
| block_of_change | Field |

### assert_delay_change_write

```rust
assert_delay_change_write(state_var, TEST_INITIAL_DELAY>, mock, pre, post, block_of_change);
```

#### Parameters
| Name | Type |
| --- | --- |
| state_var | SharedMutable&lt;Field |
| TEST_INITIAL_DELAY&gt; |  |
| mock | OracleMock |
| pre | Field |
| post | Field |
| block_of_change | Field |

### test_get_current_value_in_public

```rust
test_get_current_value_in_public();
```

Takes no parameters.

### test_get_scheduled_value_in_public

```rust
test_get_scheduled_value_in_public();
```

Takes no parameters.

### test_get_current_delay_in_public

```rust
test_get_current_delay_in_public();
```

Takes no parameters.

### test_get_scheduled_delay_in_public_before_change

```rust
test_get_scheduled_delay_in_public_before_change();
```

Takes no parameters.

### test_schedule_value_change_no_delay

```rust
test_schedule_value_change_no_delay();
```

Takes no parameters.

### test_schedule_value_change_before_change_no_scheduled_delay

```rust
test_schedule_value_change_before_change_no_scheduled_delay();
```

Takes no parameters.

### test_schedule_value_change_before_change_scheduled_delay

```rust
test_schedule_value_change_before_change_scheduled_delay();
```

Takes no parameters.

### test_schedule_value_change_after_change_no_scheduled_delay

```rust
test_schedule_value_change_after_change_no_scheduled_delay();
```

Takes no parameters.

### test_schedule_value_change_after_change_scheduled_delay

```rust
test_schedule_value_change_after_change_scheduled_delay();
```

Takes no parameters.

### test_schedule_delay_increase_before_change

```rust
test_schedule_delay_increase_before_change();
```

Takes no parameters.

### test_schedule_delay_reduction_before_change

```rust
test_schedule_delay_reduction_before_change();
```

Takes no parameters.

### test_schedule_delay_increase_after_change

```rust
test_schedule_delay_increase_after_change();
```

Takes no parameters.

### test_schedule_delay_reduction_after_change

```rust
test_schedule_delay_reduction_after_change();
```

Takes no parameters.

### test_get_current_value_in_private_before_change

```rust
test_get_current_value_in_private_before_change();
```

Takes no parameters.

