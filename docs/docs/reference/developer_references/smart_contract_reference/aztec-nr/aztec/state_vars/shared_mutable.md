## Standalone Functions

### get_storage_slot

```rust
get_storage_slot(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### new

```rust
new(context, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | Context |
| storage_slot | Field |

### get_value_change_storage_slot

```rust
get_value_change_storage_slot(self);
```

- the hash of both of these (via `hash_scheduled_data`)

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

### get_hash_storage_slot

```rust
get_hash_storage_slot(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

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

### get_current_value

```rust
get_current_value(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_current_delay

```rust
get_current_delay(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_scheduled_value

```rust
get_scheduled_value(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_scheduled_delay

```rust
get_scheduled_delay(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

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

### write

```rust
write(self, value_change, delay_change, );
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| value_change | ScheduledValueChange&lt;T&gt; |
| delay_change | ScheduledDelayChange&lt;INITIAL_DELAY&gt; |
|  |  |

### get_current_value

```rust
get_current_value(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### historical_read_from_public_storage

```rust
historical_read_from_public_storage(self, );
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
|  |  |

### hash_scheduled_data

```rust
hash_scheduled_data(value_change, delay_change, );
```

#### Parameters
| Name | Type |
| --- | --- |
| value_change | ScheduledValueChange&lt;T&gt; |
| delay_change | ScheduledDelayChange&lt;INITIAL_DELAY&gt; |
|  |  |

### get_current_value

```rust
get_current_value(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### read_value_change

```rust
read_value_change(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_public_storage_hints

```rust
get_public_storage_hints(address, storage_slot, block_number, );
```

#### Parameters
| Name | Type |
| --- | --- |
| address | AztecAddress |
| storage_slot | Field |
| block_number | u32 |
|  |  |

