# TestStruct

## Fields
| Field | Type |
| --- | --- |
| a | Field |
| b | Field |

## Standalone Functions

### read

```rust
read(storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| storage_slot | Field |

### write

```rust
write(storage_slot, value);
```

#### Parameters
| Name | Type |
| --- | --- |
| storage_slot | Field |
| value | T |

### read_historical

```rust
read_historical(//     storage_slot, //     context);
```

#### Parameters
| Name | Type |
| --- | --- |
| //     storage_slot | Field |
| //     context | PrivateContext
// |

### deserialize

```rust
deserialize(fields);
```

#### Parameters
| Name | Type |
| --- | --- |
| fields | [Field; 2] |

### serialize

```rust
serialize(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### test_read

```rust
test_read();
```

Takes no parameters.

### test_write

```rust
test_write();
```

Takes no parameters.

