## Standalone Functions

### get_header_at_oracle

```rust
get_header_at_oracle(_block_number);
```

#### Parameters
| Name | Type |
| --- | --- |
| _block_number | u32 |

#### Returns
| Type |
| --- |
| Field; HEADER_LENGTH] |

### get_header_at_internal

```rust
get_header_at_internal(block_number);
```

#### Parameters
| Name | Type |
| --- | --- |
| block_number | u32 |

#### Returns
| Type |
| --- |
| Header |

### get_header_at

```rust
get_header_at(block_number, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| block_number | u32 |
| context | PrivateContext |

#### Returns
| Type |
| --- |
| Header |

