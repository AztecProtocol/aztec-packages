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

### get_current_value_in_public

```rust
get_current_value_in_public(self);
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

### get_derived_storage_slot

```rust
get_derived_storage_slot(self);
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

### test_get_current_value_in_public_before_change

```rust
test_get_current_value_in_public_before_change();
```

Takes no parameters.

### test_get_current_value_in_public_at_change

```rust
test_get_current_value_in_public_at_change();
```

Takes no parameters.

### test_get_current_value_in_public_after_change

```rust
test_get_current_value_in_public_after_change();
```

Takes no parameters.

### test_get_scheduled_value_in_public_before_change

```rust
test_get_scheduled_value_in_public_before_change();
```

Takes no parameters.

### test_get_scheduled_value_in_public_at_change

```rust
test_get_scheduled_value_in_public_at_change();
```

Takes no parameters.

### test_get_scheduled_value_in_public_after_change

```rust
test_get_scheduled_value_in_public_after_change();
```

Takes no parameters.

### test_schedule_value_change_before_change

```rust
test_schedule_value_change_before_change();
```

Takes no parameters.

### test_schedule_value_change_at_change

```rust
test_schedule_value_change_at_change();
```

Takes no parameters.

### test_schedule_value_change_after_change

```rust
test_schedule_value_change_after_change();
```

Takes no parameters.

### test_get_current_value_in_private_before_change

```rust
test_get_current_value_in_private_before_change();
```

Takes no parameters.

