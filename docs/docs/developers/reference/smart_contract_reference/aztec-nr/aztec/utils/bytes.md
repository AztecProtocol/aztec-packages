## Standalone Functions

### bytes_to_fields

```rust
bytes_to_fields(input);
```

For example, [1, 10, 3] is encoded as [1 * 256^2 + 10 * 256 + 3]

#### Parameters
| Name | Type |
| --- | --- |
| input | [u8; N] |

### fields_to_bytes

```rust
fields_to_bytes(input);
```

TODO(#8618): Optimize for public use.

#### Parameters
| Name | Type |
| --- | --- |
| input | [Field; M] |

### test_bytes_to_1_field

```rust
test_bytes_to_1_field();
```

Takes no parameters.

### test_1_field_to_bytes

```rust
test_1_field_to_bytes();
```

Takes no parameters.

### test_3_small_fields_to_bytes

```rust
test_3_small_fields_to_bytes();
```

Takes no parameters.

### test_3_small_fields_to_less_bytes

```rust
test_3_small_fields_to_less_bytes();
```

Takes no parameters.

### test_bytes_to_2_fields

```rust
test_bytes_to_2_fields();
```

Takes no parameters.

### test_2_fields_to_bytes

```rust
test_2_fields_to_bytes();
```

Takes no parameters.

### test_large_random_input_to_fields_and_back

```rust
test_large_random_input_to_fields_and_back(input);
```

#### Parameters
| Name | Type |
| --- | --- |
| input | [u8; 128] |

### test_large_random_input_to_bytes_and_back

```rust
test_large_random_input_to_bytes_and_back(input1, input2, input3, input4, input5, input6, );
```

#### Parameters
| Name | Type |
| --- | --- |
| input1 | [u64; 5] |
| input2 | [u64; 5] |
| input3 | [u64; 5] |
| input4 | [u32; 5] |
| input5 | [u16; 5] |
| input6 | [u8; 5] |
|  |  |

### test_too_few_destination_bytes

```rust
test_too_few_destination_bytes();
```

Takes no parameters.

### test_fields_to_bytes_value_too_large

```rust
test_fields_to_bytes_value_too_large();
```

Takes no parameters.

### test_fields_to_bytes_max_value

```rust
test_fields_to_bytes_max_value();
```

Takes no parameters.

