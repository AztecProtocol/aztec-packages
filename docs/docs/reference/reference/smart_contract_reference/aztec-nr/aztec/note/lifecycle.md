## Standalone Functions

### create_note

```rust
create_note(context, storage_slot, note, broadcast);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| storage_slot | Field |
| note | &mut Note |
| broadcast | bool |

### create_note_hash_from_public

```rust
create_note_hash_from_public(context, storage_slot, note);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PublicContext |
| storage_slot | Field |
| note | &mut Note |

### destroy_note

```rust
destroy_note(context, note);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| note | Note |

