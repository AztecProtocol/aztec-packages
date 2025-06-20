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

### schedule_value_change

```rust
schedule_value_change(self, new_value);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| new_value | T |

### schedule_and_return_value_change

```rust
schedule_and_return_value_change(self, new_value, );
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| new_value | T |
|  |  |

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

### get_current_value

```rust
get_current_value(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

