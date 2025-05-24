## Standalone Functions

### new

```rust
new(value);
```

#### Parameters
| Name | Type |
| --- | --- |
| value | T |

### get_value

```rust
get_value(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_hash

```rust
get_hash(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### public_storage_read

```rust
public_storage_read(context, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | PublicContext |
| storage_slot | Field |

### utility_public_storage_read

```rust
utility_public_storage_read(context, storage_slot, );
```

#### Parameters
| Name | Type |
| --- | --- |
| context | UtilityContext |
| storage_slot | Field |
|  |  |

### historical_public_storage_read

```rust
historical_public_storage_read(header, address, storage_slot, );
```

#### Parameters
| Name | Type |
| --- | --- |
| header | BlockHeader |
| address | AztecAddress |
| storage_slot | Field |
|  |  |

### pack

```rust
pack(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### unpack

```rust
unpack(packed);
```

#### Parameters
| Name | Type |
| --- | --- |
| packed | [Field; N + 1] |

### create_and_recover

```rust
create_and_recover();
```

Takes no parameters.

### read_uninitialized_value

```rust
read_uninitialized_value();
```

Takes no parameters.

### read_initialized_value

```rust
read_initialized_value();
```

Takes no parameters.

### test_bad_hint_uninitialized_value

```rust
test_bad_hint_uninitialized_value();
```

Takes no parameters.

### test_bad_hint_initialized_value

```rust
test_bad_hint_initialized_value();
```

Takes no parameters.

