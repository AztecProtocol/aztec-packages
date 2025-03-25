## Standalone Functions

### fields_to_bytes

```rust
fields_to_bytes(fields);
```

/ indistinguishable from random bytes.

#### Parameters
| Name | Type |
| --- | --- |
| fields | [Field; N] |

### fields_from_bytes

```rust
fields_from_bytes(bytes, N>);
```

/ Note 2: The max value check code was taken from std::field::to_be_bytes function.

#### Parameters
| Name | Type |
| --- | --- |
| bytes | BoundedVec&lt;u8 |
| N&gt; |  |

### random_fields_to_bytes_and_back

```rust
random_fields_to_bytes_and_back(input);
```

#### Parameters
| Name | Type |
| --- | --- |
| input | [Field; 3] |

### to_fields_assert

```rust
to_fields_assert();
```

Takes no parameters.

### fields_from_bytes_max_value

```rust
fields_from_bytes_max_value();
```

Takes no parameters.

### fields_from_bytes_overflow

```rust
fields_from_bytes_overflow(random_value);
```

#### Parameters
| Name | Type |
| --- | --- |
| random_value | u8 |

