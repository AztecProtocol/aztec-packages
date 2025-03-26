# MockStruct

## Fields
| Field | Type |
| --- | --- |
| pub a | Field |
| pub b | Field |

## Methods

### new

```rust
MockStruct::new(a, b);
```

#### Parameters
| Name | Type |
| --- | --- |
| a | Field |
| b | Field |

## Standalone Functions

### eq

```rust
eq(self, other);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| other | Self |

### empty

```rust
empty();
```

Takes no parameters.

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
deserialize(fields);
```

#### Parameters
| Name | Type |
| --- | --- |
| fields | [Field; 2] |

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
unpack(fields);
```

#### Parameters
| Name | Type |
| --- | --- |
| fields | [Field; 2] |

### test_serde

```rust
test_serde();
```

Takes no parameters.

### test_packable

```rust
test_packable();
```

Takes no parameters.

