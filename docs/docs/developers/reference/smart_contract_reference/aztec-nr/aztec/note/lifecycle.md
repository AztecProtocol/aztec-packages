## Standalone Functions

### create_note

```rust
create_note(context, storage_slot, note, );
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| storage_slot | Field |
| note | &mut Note |
|  |  |

### create_note_hash_from_public

```rust
create_note_hash_from_public(context, storage_slot, note, );
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PublicContext |
| storage_slot | Field |
| note | &mut Note |
|  |  |

### destroy_note

```rust
destroy_note(context, note);
```

Note: This function is currently totally unused.

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| note | Note |

### destroy_note_unsafe

```rust
destroy_note_unsafe(context, note, note_hash_for_read_request, );
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| note | Note |
| note_hash_for_read_request | Field |
|  |  |

