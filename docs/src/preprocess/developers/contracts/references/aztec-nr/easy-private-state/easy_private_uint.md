# EasyPrivateUint

## Fields
| Field | Type |
| --- | --- |
| context | Context |
| set | Set&lt;ValueNote&gt; |
| storage_slot | Field |

## Methods

### add

Very similar to `value_note::utils::increment`.

```rust
EasyPrivateUint::add(self, addend, owner);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| addend | u120 |
| owner | AztecAddress |

### sub

Very similar to `value_note::utils::decrement`.

```rust
EasyPrivateUint::sub(self, subtrahend, owner);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| subtrahend | u120 |
| owner | AztecAddress |

