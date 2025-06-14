## Standalone Functions

### get_id

```rust
get_id();
```

Takes no parameters.

### compute_note_hash

```rust
compute_note_hash(self, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| storage_slot | Field |

### compute_nullifier

```rust
compute_nullifier(self, context, note_hash_for_nullify);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |
| note_hash_for_nullify | Field |

### compute_nullifier_unconstrained

```rust
compute_nullifier_unconstrained(self, note_hash_for_nullify);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| note_hash_for_nullify | Field |

### properties

```rust
properties();
```

Takes no parameters.

### setup_payload

```rust
setup_payload();
```

Takes no parameters.

### finalization_payload

```rust
finalization_payload();
```

Takes no parameters.

