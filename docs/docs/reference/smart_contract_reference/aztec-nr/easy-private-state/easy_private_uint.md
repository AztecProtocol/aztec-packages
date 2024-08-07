## Standalone Functions

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
add(self, addend, owner, outgoing_viewer);
```

Very similar to `value_note::utils::increment`.

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| addend | u64 |
| owner | AztecAddress |
| outgoing_viewer | AztecAddress |

### sub

```rust
sub(self, subtrahend, owner, outgoing_viewer);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| subtrahend | u64 |
| owner | AztecAddress |
| outgoing_viewer | AztecAddress |

