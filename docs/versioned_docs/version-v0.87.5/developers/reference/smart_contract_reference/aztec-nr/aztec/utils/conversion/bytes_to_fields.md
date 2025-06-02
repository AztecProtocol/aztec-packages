## Standalone Functions

### bytes_to_fields

```rust
bytes_to_fields(bytes);
```

/ Note: N must be a multiple of 31 bytes

#### Parameters
| Name | Type |
| --- | --- |
| bytes | [u8; N] |

### bytes_from_fields

```rust
bytes_from_fields(fields, N>);
```

/ back together in the order of the original fields.

#### Parameters
| Name | Type |
| --- | --- |
| fields | BoundedVec&lt;Field |
| N&gt; |  |

### random_bytes_to_fields_and_back

```rust
random_bytes_to_fields_and_back(input);
```

#### Parameters
| Name | Type |
| --- | --- |
| input | [u8; 93] |

### bytes_to_fields_input_length_not_multiple_of_31

```rust
bytes_to_fields_input_length_not_multiple_of_31();
```

Takes no parameters.

