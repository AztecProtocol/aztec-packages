## Standalone Functions

### point_to_bytes

```rust
point_to_bytes(p);
```

/ to waste the extra byte (encrypted log).

#### Parameters
| Name | Type |
| --- | --- |
| p | Point |

### get_sign_of_point

```rust
get_sign_of_point(p);
```

#### Parameters
| Name | Type |
| --- | --- |
| p | Point |

### point_from_x_coord

```rust
point_from_x_coord(x);
```

#### Parameters
| Name | Type |
| --- | --- |
| x | Field |

### point_from_x_coord_and_sign

```rust
point_from_x_coord_and_sign(x, sign);
```

/ @param sign - The "sign" of the y coordinate - determines whether y &lt;= (Fr.MODULUS - 1) / 2

#### Parameters
| Name | Type |
| --- | --- |
| x | Field |
| sign | bool |

### test_point_to_bytes_positive_sign

```rust
test_point_to_bytes_positive_sign();
```

Takes no parameters.

### test_point_to_bytes_negative_sign

```rust
test_point_to_bytes_negative_sign();
```

Takes no parameters.

### test_point_from_x_coord_and_sign

```rust
test_point_from_x_coord_and_sign();
```

Takes no parameters.

