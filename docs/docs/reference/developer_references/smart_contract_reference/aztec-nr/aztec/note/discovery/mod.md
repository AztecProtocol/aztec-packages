# NoteHashesAndNullifier

## Fields
| Field | Type |
| --- | --- |
| pub note_hash | Field |
| pub unique_note_hash | Field |
| pub inner_nullifier | Field |

## Standalone Functions

### do_process_log

```rust
do_process_log(context, log_plaintext, PRIVATE_LOG_SIZE_IN_FIELDS>, tx_hash, unique_note_hashes_in_tx, MAX_NOTE_HASHES_PER_TX>, first_nullifier_in_tx, recipient, compute_note_hash_and_nullifier, MAX_NOTE_SERIALIZED_LEN>, NoteHeader, Field);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | UnconstrainedContext |
| log_plaintext | BoundedVec&lt;Field |
| PRIVATE_LOG_SIZE_IN_FIELDS&gt; |  |
| tx_hash | Field |
| unique_note_hashes_in_tx | BoundedVec&lt;Field |
| MAX_NOTE_HASHES_PER_TX&gt; |  |
| first_nullifier_in_tx | Field |
| recipient | AztecAddress |
| compute_note_hash_and_nullifier | fn[Env](BoundedVec&lt;Field |
| MAX_NOTE_SERIALIZED_LEN&gt; |  |
| NoteHeader |  |
| Field |  |

### destructure_log_plaintext

```rust
destructure_log_plaintext(log_plaintext, PRIVATE_LOG_SIZE_IN_FIELDS>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| log_plaintext | BoundedVec&lt;Field |
| PRIVATE_LOG_SIZE_IN_FIELDS&gt; |  |
|  |  |

### for_each_in_bounded_vec

```rust
for_each_in_bounded_vec(vec, MaxLen>, f, u32);
```

#### Parameters
| Name | Type |
| --- | --- |
| vec | BoundedVec&lt;T |
| MaxLen&gt; |  |
| f | fn[Env](T |
| u32 |  |

