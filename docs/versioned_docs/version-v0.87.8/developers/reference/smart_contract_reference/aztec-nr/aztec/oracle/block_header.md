## Standalone Functions

### get_block_header_at_oracle

```rust
get_block_header_at_oracle(_block_number);
```

#### Parameters
| Name | Type |
| --- | --- |
| _block_number | u32 |

### get_block_header_at_internal

```rust
get_block_header_at_internal(block_number);
```

#### Parameters
| Name | Type |
| --- | --- |
| block_number | u32 |

### get_block_header_at

```rust
get_block_header_at(block_number, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| block_number | u32 |
| context | PrivateContext |

### constrain_get_block_header_at_internal

```rust
constrain_get_block_header_at_internal(header_hint, block_number, last_archive_block_number, last_archive_root, );
```

#### Parameters
| Name | Type |
| --- | --- |
| header_hint | BlockHeader |
| block_number | u32 |
| last_archive_block_number | u32 |
| last_archive_root | Field |
|  |  |

### fetching_a_valid_but_different_header_should_fail

```rust
fetching_a_valid_but_different_header_should_fail();
```

Takes no parameters.

