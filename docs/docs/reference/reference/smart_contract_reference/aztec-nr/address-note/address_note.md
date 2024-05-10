# AddressNote

## Fields
| Field | Type |
| --- | --- |
| address | AztecAddress |
| owner | AztecAddress |
| randomness | Field |

## Methods

### new

```rust
AddressNote::new(address, owner);
```

#### Parameters
| Name | Type |
| --- | --- |
| address | AztecAddress |
| owner | AztecAddress |

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
broadcast(self, context, slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |
| slot | Field |

