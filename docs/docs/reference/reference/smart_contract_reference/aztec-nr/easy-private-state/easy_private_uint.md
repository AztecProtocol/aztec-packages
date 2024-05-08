# EasyPrivateUint

## Fields
| Field | Type |
| --- | --- |
| context | Context |
| set | PrivateSet&lt;ValueNote&gt; |
| storage_slot | Field |

## Methods

### new

```rust
EasyPrivateUint::new(context, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | Context |
| storage_slot | Field |

### add

Very similar to `value_note::utils::increment`.

```rust
EasyPrivateUint::add(self, addend, owner);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| addend | u64 |
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
| subtrahend | u64 |
| owner | AztecAddress |

