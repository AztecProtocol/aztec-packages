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

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| current_block_number | u32 |

### get_scheduled

```rust
get_scheduled(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### schedule_change

```rust
schedule_change(&mut self, new, current_block_number);
```

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

### eq

```rust
eq(self, other);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| other | Self |

