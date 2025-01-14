# UintNote

## Fields
| Field | Type |
| --- | --- |
| value | U128 |
| owner | AztecAddress |
| randomness | Field |

## Methods

### new

```rust
UintNote::new(value, owner);
```

#### Parameters
| Name | Type |
| --- | --- |
| value | U128 |
| owner | AztecAddress |

### get_value

```rust
UintNote::get_value(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

## Standalone Functions

### compute_nullifier

```rust
compute_nullifier(self, context, note_hash_for_nullify, );
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |
| note_hash_for_nullify | Field |
|  |  |

### compute_nullifier_without_context

```rust
compute_nullifier_without_context(self);
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

