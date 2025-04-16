## Standalone Functions

### pow

```rust
pow(x, y);
```

Adapted from std::field::pow_32.

#### Parameters
| Name | Type |
| --- | --- |
| x | Field |
| y | Field |

### is_square

```rust
is_square(x);
```

#### Parameters
| Name | Type |
| --- | --- |
| x | Field |

### tonelli_shanks_sqrt

```rust
tonelli_shanks_sqrt(x);
```

#### Parameters
| Name | Type |
| --- | --- |
| x | Field |

### __sqrt

```rust
__sqrt(x);
```

#### Parameters
| Name | Type |
| --- | --- |
| x | Field |

### sqrt

```rust
sqrt(x);
```

Returns (true, sqrt) if there is a square root.

#### Parameters
| Name | Type |
| --- | --- |
| x | Field |

### validate_sqrt_hint

```rust
validate_sqrt_hint(x, hint);
```

#### Parameters
| Name | Type |
| --- | --- |
| x | Field |
| hint | Field |

### validate_not_sqrt_hint

```rust
validate_not_sqrt_hint(x, hint);
```

#### Parameters
| Name | Type |
| --- | --- |
| x | Field |
| hint | Field |

### test_sqrt

```rust
test_sqrt();
```

Takes no parameters.

### test_non_square

```rust
test_non_square();
```

Takes no parameters.

### test_known_non_residue_is_actually_a_non_residue_in_the_field

```rust
test_known_non_residue_is_actually_a_non_residue_in_the_field();
```

Takes no parameters.

### test_sqrt_0

```rust
test_sqrt_0();
```

Takes no parameters.

### test_sqrt_1

```rust
test_sqrt_1();
```

Takes no parameters.

### test_bad_sqrt_hint_fails

```rust
test_bad_sqrt_hint_fails();
```

Takes no parameters.

### test_bad_not_sqrt_hint_fails

```rust
test_bad_not_sqrt_hint_fails();
```

Takes no parameters.

### test_0_not_sqrt_hint_fails

```rust
test_0_not_sqrt_hint_fails();
```

Takes no parameters.

### test_is_square

```rust
test_is_square();
```

Takes no parameters.

### test_is_not_square

```rust
test_is_not_square();
```

Takes no parameters.

