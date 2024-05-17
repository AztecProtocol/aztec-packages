# PublicKeys

## Fields
| Field | Type |
| --- | --- |
| npk_m | GrumpkinPoint |
| ivpk_m | GrumpkinPoint |
| ovpk_m | GrumpkinPoint |
| tpk_m | GrumpkinPoint |

## Methods

### hash

```rust
PublicKeys::hash(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_key_by_index

```rust
PublicKeys::get_key_by_index(self, index);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| index | Field |

## Standalone Functions

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
deserialize(serialized);
```

#### Parameters
| Name | Type |
| --- | --- |
| serialized | [Field; PUBLIC_KEYS_LENGTH] |

### compute_public_keys_hash

```rust
compute_public_keys_hash();
```

Takes no parameters.

### test_public_keys_serialization

```rust
test_public_keys_serialization();
```

Takes no parameters.

