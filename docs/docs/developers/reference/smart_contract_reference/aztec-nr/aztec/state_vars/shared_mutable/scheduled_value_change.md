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

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| block_number | u32 |

### get_scheduled

```rust
get_scheduled(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_block_horizon

```rust
get_block_horizon(self, historical_block_number, minimum_delay);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| historical_block_number | u32 |
| minimum_delay | u32 |

### schedule_change

```rust
schedule_change(&mut self, new_value, current_block_number, minimum_delay, block_of_change, );
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| new_value | T |
| current_block_number | u32 |
| minimum_delay | u32 |
| block_of_change | u32 |
|  |  |

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

### eq

```rust
eq(self, other);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| other | Self |

