# AddressNote

## Fields
| Field | Type |
| --- | --- |
| address | AztecAddress |
| npk_m_hash | Field |
| randomness | Field |

## Methods

### new

```rust
AddressNote::new(address, npk_m_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| address | AztecAddress |
| npk_m_hash | Field |

## Standalone Functions

### compute_nullifier

```rust
compute_nullifier(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |

### compute_nullifier_without_context

```rust
compute_nullifier_without_context(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### broadcast

```rust
broadcast(self, context, slot, ivpk_m);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |
| slot | Field |
| ivpk_m | GrumpkinPoint |

