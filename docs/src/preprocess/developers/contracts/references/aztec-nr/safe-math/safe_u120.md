# SafeU120

## Fields
| Field | Type |
| --- | --- |
| value | u120 |

## Methods

### min

```rust
SafeU120::min();
```

Takes no parameters.

#### Returns
| Type |
| --- |
| Self |

### max

```rust
SafeU120::max();
```

Takes no parameters.

#### Returns
| Type |
| --- |
| Self |

### lt

```rust
SafeU120::lt(self, other);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |
| other | Self |

#### Returns
| Type |
| --- |
| bool |

### le

```rust
SafeU120::le(self, other);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |
| other | Self |

#### Returns
| Type |
| --- |
| bool |

### gt

```rust
SafeU120::gt(self, other);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |
| other | Self |

#### Returns
| Type |
| --- |
| bool |

### ge

```rust
SafeU120::ge(self, other);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |
| other | Self |

#### Returns
| Type |
| --- |
| bool |

## Standalone Functions

### serialize

```rust
serialize(value);
```

#### Parameters
| Name | Type |
| --- | --- |
| value | SafeU120 |

#### Returns
| Type |
| --- |
| Field; SAFE_U120_SERIALIZED_LEN] |

### deserialize

```rust
deserialize(fields);
```

This is safe when reading from storage IF only correct safeu120 was written to storage

#### Parameters
| Name | Type |
| --- | --- |
| fields | [Field; SAFE_U120_SERIALIZED_LEN] |

#### Returns
| Type |
| --- |
| SafeU120 |

### test_init

```rust
test_init();
```

Takes no parameters.

### test_init_max

```rust
test_init_max();
```

Takes no parameters.

### test_init_min

```rust
test_init_min();
```

Takes no parameters.

### test_is_zero

```rust
test_is_zero();
```

Takes no parameters.

### test_eq

```rust
test_eq();
```

Takes no parameters.

### test_lt

```rust
test_lt();
```

Takes no parameters.

### test_le

```rust
test_le();
```

Takes no parameters.

### test_gt

```rust
test_gt();
```

Takes no parameters.

### test_ge

```rust
test_ge();
```

Takes no parameters.

### test_init_too_large

```rust
test_init_too_large();
```

Takes no parameters.

### test_add

```rust
test_add();
```

Takes no parameters.

### test_add_overflow

```rust
test_add_overflow();
```

Takes no parameters.

### test_sub

```rust
test_sub();
```

Takes no parameters.

### test_sub_underflow

```rust
test_sub_underflow();
```

Takes no parameters.

### test_mul

```rust
test_mul();
```

Takes no parameters.

### test_mul_overflow

```rust
test_mul_overflow();
```

Takes no parameters.

### test_div

```rust
test_div();
```

Takes no parameters.

### test_div_by_zero

```rust
test_div_by_zero();
```

Takes no parameters.

### test_mul_div

```rust
test_mul_div();
```

Takes no parameters.

### test_mul_div_zero_divisor

```rust
test_mul_div_zero_divisor();
```

Takes no parameters.

### test_mul_div_ghost_overflow

```rust
test_mul_div_ghost_overflow();
```

Takes no parameters.

### test_mul_div_up_rounding

```rust
test_mul_div_up_rounding();
```

Takes no parameters.

### test_mul_div_up_non_rounding

```rust
test_mul_div_up_non_rounding();
```

Takes no parameters.

### test_mul_div_up_ghost_overflow

```rust
test_mul_div_up_ghost_overflow();
```

Takes no parameters.

### test_mul_div_up_zero_divisor

```rust
test_mul_div_up_zero_divisor();
```

Takes no parameters.

