## Standalone Functions

### from_string

```rust
from_string(input_string);
```

#### Parameters
| Name | Type |
| --- | --- |
| input_string | str&lt;M&gt; |

### to_bytes

```rust
to_bytes(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### eq

```rust
eq(self, other, M>);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| other | CompressedString&lt;N |
| M&gt; |  |

### serialize

```rust
serialize(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### deserialize

```rust
deserialize(input);
```

#### Parameters
| Name | Type |
| --- | --- |
| input | [Field; N] |

### test_short_string

```rust
test_short_string();
```

Takes no parameters.

### test_long_string

```rust
test_long_string();
```

Takes no parameters.

### test_long_string_work_with_too_many_fields

```rust
test_long_string_work_with_too_many_fields();
```

Takes no parameters.

### test_serde

```rust
test_serde();
```

Takes no parameters.

### test_long_string_fail_with_too_few_fields

```rust
test_long_string_fail_with_too_few_fields();
```

Takes no parameters.

