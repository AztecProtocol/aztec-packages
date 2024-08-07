# MockStruct

## Fields
| Field | Type |
| --- | --- |
| a | Field |
| b | Field |

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

### test_serde

```rust
test_serde();
```

Takes no parameters.

