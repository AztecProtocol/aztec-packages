## Standalone Functions

### get_storage_slot

```rust
get_storage_slot(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### new

```rust
new(context, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | Context |
| storage_slot | Field |

### add

```rust
add(self, addend, owner, sender);
```

Very similar to `value_note::utils::increment`.

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| addend | u64 |
| owner | AztecAddress |
| sender | AztecAddress |

### sub

```rust
sub(self, subtrahend, owner, sender);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| subtrahend | u64 |
| owner | AztecAddress |
| sender | AztecAddress |

