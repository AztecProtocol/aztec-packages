## Standalone Functions

### be_bytes_31_to_fields

```rust
be_bytes_31_to_fields(bytes);
```

/ Note: ceil(N / 31) = (N + 30) / 31

#### Parameters
| Name | Type |
| --- | --- |
| bytes | [u8; N] |

### le_bytes_31_to_fields

```rust
le_bytes_31_to_fields(bytes);
```

#### Parameters
| Name | Type |
| --- | --- |
| bytes | [u8; N] |

### fields_to_be_bytes_31

```rust
fields_to_be_bytes_31(fields);
```

/ TODO: this is the same as the "le" version of this function, save for the `field.to_be_bytes()` calls. I tried passing the conversion function in as a parameter, to reduce code duplication, but couldn't get it to work.

#### Parameters
| Name | Type |
| --- | --- |
| fields | [Field; N] |

### fields_to_le_bytes_31

```rust
fields_to_le_bytes_31(fields);
```

/ end up with quite a strange ordering of bytes if you use this particular function.

#### Parameters
| Name | Type |
| --- | --- |
| fields | [Field; N] |

### fields_to_be_bytes_32

```rust
fields_to_be_bytes_32(fields);
```

/ every 32 bytes. Be careful that such a gap doesn't leak information!

#### Parameters
| Name | Type |
| --- | --- |
| fields | [Field; N] |

### byte_to_bits

```rust
byte_to_bits(byte);
```

#### Parameters
| Name | Type |
| --- | --- |
| byte | u8 |

### get_random_bytes

```rust
get_random_bytes();
```

Takes no parameters.

### get_random_bits

```rust
get_random_bits();
```

Takes no parameters.

### get_chunks_of_random_bits

```rust
get_chunks_of_random_bits();
```

Takes no parameters.

### pad_31_byte_fields_with_random_bits

```rust
pad_31_byte_fields_with_random_bits(input);
```

#### Parameters
| Name | Type |
| --- | --- |
| input | [Field; N] |

### le_bytes_to_padded_fields

```rust
le_bytes_to_padded_fields(input);
```

#### Parameters
| Name | Type |
| --- | --- |
| input | [u8; N] |

### be_bytes_to_padded_fields

```rust
be_bytes_to_padded_fields(input);
```

#### Parameters
| Name | Type |
| --- | --- |
| input | [u8; N] |

### test_be_bytes_31_to_1_field

```rust
test_be_bytes_31_to_1_field();
```

Takes no parameters.

### test_1_field_to_be_bytes_31

```rust
test_1_field_to_be_bytes_31();
```

Takes no parameters.

### test_3_small_fields_to_be_bytes_31

```rust
test_3_small_fields_to_be_bytes_31();
```

Takes no parameters.

### test_3_small_fields_to_fewer_be_bytes

```rust
test_3_small_fields_to_fewer_be_bytes();
```

Takes no parameters.

### test_be_bytes_31_to_2_fields

```rust
test_be_bytes_31_to_2_fields();
```

Takes no parameters.

### test_2_fields_to_be_bytes_31

```rust
test_2_fields_to_be_bytes_31();
```

Takes no parameters.

### test_large_random_be_bytes_31_input_to_fields_and_back

```rust
test_large_random_be_bytes_31_input_to_fields_and_back(input);
```

#### Parameters
| Name | Type |
| --- | --- |
| input | [u8; 128] |

### test_large_random_input_to_be_bytes_31_and_back

```rust
test_large_random_input_to_be_bytes_31_and_back(input1, input2, input3, input4, input5, input6, );
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

### test_too_few_destination_be_bytes

```rust
test_too_few_destination_be_bytes();
```

Takes no parameters.

### test_fields_to_be_bytes_31_value_too_large

```rust
test_fields_to_be_bytes_31_value_too_large();
```

Takes no parameters.

### test_fields_to_be_bytes_31_max_value

```rust
test_fields_to_be_bytes_31_max_value();
```

Takes no parameters.

### test_le_bytes_31_to_1_field

```rust
test_le_bytes_31_to_1_field();
```

Takes no parameters.

### test_1_field_to_le_bytes_31

```rust
test_1_field_to_le_bytes_31();
```

Takes no parameters.

### test_3_small_fields_to_le_bytes_31

```rust
test_3_small_fields_to_le_bytes_31();
```

Takes no parameters.

### test_3_small_fields_to_fewer_le_bytes

```rust
test_3_small_fields_to_fewer_le_bytes();
```

Takes no parameters.

### test_le_bytes_31_to_2_fields

```rust
test_le_bytes_31_to_2_fields();
```

Takes no parameters.

### test_2_fields_to_le_bytes_31

```rust
test_2_fields_to_le_bytes_31();
```

Takes no parameters.

### test_large_random_le_bytes_input_to_fields_and_back

```rust
test_large_random_le_bytes_input_to_fields_and_back(input);
```

#### Parameters
| Name | Type |
| --- | --- |
| input | [u8; 128] |

### test_large_random_input_to_le_bytes_and_back

```rust
test_large_random_input_to_le_bytes_and_back(input1, input2, input3, input4, input5, input6, );
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

### test_too_few_destination_le_bytes

```rust
test_too_few_destination_le_bytes();
```

Takes no parameters.

### test_fields_to_le_bytes_31_value_too_large

```rust
test_fields_to_le_bytes_31_value_too_large();
```

Takes no parameters.

### test_fields_to_le_bytes_31_max_value

```rust
test_fields_to_le_bytes_31_max_value();
```

Takes no parameters.

