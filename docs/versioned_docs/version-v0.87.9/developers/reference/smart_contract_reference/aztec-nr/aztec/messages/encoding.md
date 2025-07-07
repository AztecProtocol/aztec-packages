## Standalone Functions

### encode_message

```rust
encode_message(msg_type, msg_metadata, msg_content, );
```

/ this smaller variable to achieve higher data efficiency.

#### Parameters
| Name | Type |
| --- | --- |
| msg_type | u64 |
| msg_metadata | u64 |
| msg_content | [Field; N] |
|  |  |

### decode_message

```rust
decode_message(message, MAX_MESSAGE_LEN>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| message | BoundedVec&lt;Field |
| MAX_MESSAGE_LEN&gt; |  |
|  |  |

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

### encode_decode_empty_message

```rust
encode_decode_empty_message(msg_type, msg_metadata);
```

#### Parameters
| Name | Type |
| --- | --- |
| msg_type | u64 |
| msg_metadata | u64 |

### encode_decode_short_message

```rust
encode_decode_short_message(msg_type, msg_metadata, msg_content, );
```

#### Parameters
| Name | Type |
| --- | --- |
| msg_type | u64 |
| msg_metadata | u64 |
| msg_content | [Field; MAX_MESSAGE_CONTENT_LEN / 2] |
|  |  |

### encode_decode_full_message

```rust
encode_decode_full_message(msg_type, msg_metadata, msg_content, );
```

#### Parameters
| Name | Type |
| --- | --- |
| msg_type | u64 |
| msg_metadata | u64 |
| msg_content | [Field; MAX_MESSAGE_CONTENT_LEN] |
|  |  |

### to_expanded_metadata_packing

```rust
to_expanded_metadata_packing();
```

Takes no parameters.

### from_expanded_metadata_packing

```rust
from_expanded_metadata_packing();
```

Takes no parameters.

### to_from_expanded_metadata

```rust
to_from_expanded_metadata(original_msg_type, original_msg_metadata);
```

#### Parameters
| Name | Type |
| --- | --- |
| original_msg_type | u64 |
| original_msg_metadata | u64 |

