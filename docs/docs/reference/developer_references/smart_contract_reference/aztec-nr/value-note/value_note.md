# ValueNote

## Fields
| Field | Type |
| --- | --- |
| value | Field |
| npk_m_hash | Field |
| randomness | Field |

## Methods

### new

```rust
ValueNote::new(value, npk_m_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| value | Field |
| npk_m_hash | Field |

## Standalone Functions

### compute_note_hash_and_nullifier

```rust
compute_note_hash_and_nullifier(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |

### compute_note_hash_and_nullifier_without_context

```rust
compute_note_hash_and_nullifier_without_context(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### serialize

```rust
serialize(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### eq

```rust
eq(self, other);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| other | Self |

