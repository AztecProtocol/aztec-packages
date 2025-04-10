## Standalone Functions

### compute_note_hash_for_read_request

```rust
compute_note_hash_for_read_request(retrieved_note, storage_slot, );
```

/ Returns the note hash that must be used to issue a private kernel read request for a note.

#### Parameters
| Name | Type |
| --- | --- |
| retrieved_note | RetrievedNote&lt;Note&gt; |
| storage_slot | Field |
|  |  |

### compute_note_hash_for_nullify

```rust
compute_note_hash_for_nullify(retrieved_note, storage_slot, );
```

/ `NoteHash::compute_nullifier_unconstrained`.

#### Parameters
| Name | Type |
| --- | --- |
| retrieved_note | RetrievedNote&lt;Note&gt; |
| storage_slot | Field |
|  |  |

### compute_note_hash_for_nullify_from_read_request

```rust
compute_note_hash_for_nullify_from_read_request(retrieved_note, note_hash_for_read_request, );
```

/ computed to reduce constraints by reusing this value.

#### Parameters
| Name | Type |
| --- | --- |
| retrieved_note | RetrievedNote&lt;Note&gt; |
| note_hash_for_read_request | Field |
|  |  |

### compute_siloed_note_nullifier

```rust
compute_siloed_note_nullifier(retrieved_note, storage_slot, context, );
```

/ Computes a note's siloed nullifier, i.e. the one that will be inserted into the nullifier tree.

#### Parameters
| Name | Type |
| --- | --- |
| retrieved_note | RetrievedNote&lt;Note&gt; |
| storage_slot | Field |
| context | &mut PrivateContext |
|  |  |

