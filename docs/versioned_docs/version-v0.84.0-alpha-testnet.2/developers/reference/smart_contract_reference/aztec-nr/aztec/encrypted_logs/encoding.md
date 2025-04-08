## Standalone Functions

### to_expanded_metadata

```rust
to_expanded_metadata(msg_type, msg_metadata);
```

#### Parameters
| Name | Type |
| --- | --- |
| msg_type | u64 |
| msg_metadata | u64 |

### from_expanded_metadata

```rust
from_expanded_metadata(input);
```

#### Parameters
| Name | Type |
| --- | --- |
| input | Field |

### packing_metadata

```rust
packing_metadata();
```

Takes no parameters.

### unpacking_metadata

```rust
unpacking_metadata();
```

Takes no parameters.

### roundtrip_metadata

```rust
roundtrip_metadata(original_msg_type, original_msg_metadata);
```

#### Parameters
| Name | Type |
| --- | --- |
| original_msg_type | u64 |
| original_msg_metadata | u64 |

