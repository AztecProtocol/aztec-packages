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
| note | Note |
|  |  |

### destroy_note

```rust
destroy_note(context, retrieved_note, storage_slot, );
```

Note: This function is currently totally unused.

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| retrieved_note | RetrievedNote&lt;Note&gt; |
| storage_slot | Field |
|  |  |

### destroy_note_unsafe

```rust
destroy_note_unsafe(context, retrieved_note, note_hash_for_read_request, );
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| retrieved_note | RetrievedNote&lt;Note&gt; |
| note_hash_for_read_request | Field |
|  |  |

