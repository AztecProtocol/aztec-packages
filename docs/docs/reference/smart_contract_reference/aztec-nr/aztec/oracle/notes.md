## Standalone Functions

### notify_created_note_oracle

```rust
notify_created_note_oracle(_storage_slot, _note_type_id, _serialized_note, _inner_note_hash, _counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| _storage_slot | Field |
| _note_type_id | Field |
| _serialized_note | [Field; N] |
| _inner_note_hash | Field |
| _counter | u32 |

### notify_created_note

```rust
notify_created_note(storage_slot, note_type_id, serialized_note, inner_note_hash, counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| storage_slot | Field |
| note_type_id | Field |
| serialized_note | [Field; N] |
| inner_note_hash | Field |
| counter | u32 |

### notify_nullified_note_oracle

```rust
notify_nullified_note_oracle(_nullifier, _inner_note_hash, _counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| _nullifier | Field |
| _inner_note_hash | Field |
| _counter | u32 |

### notify_nullified_note

```rust
notify_nullified_note(nullifier, inner_note_hash, counter);
```

#### Parameters
| Name | Type |
| --- | --- |
| nullifier | Field |
| inner_note_hash | Field |
| counter | u32 |

### get_notes_oracle

```rust
get_notes_oracle(_storage_slot, _num_selects, _select_by_indexes, _select_by_offsets, _select_by_lengths, _select_values, _select_comparators, _sort_by_indexes, _sort_by_offsets, _sort_by_lengths, _sort_order, _limit, _offset, _status, _return_size, _placeholder_fields);
```

#### Parameters
| Name | Type |
| --- | --- |
| _storage_slot | Field |
| _num_selects | u8 |
| _select_by_indexes | [u8; N] |
| _select_by_offsets | [u8; N] |
| _select_by_lengths | [u8; N] |
| _select_values | [Field; N] |
| _select_comparators | [u8; N] |
| _sort_by_indexes | [u8; N] |
| _sort_by_offsets | [u8; N] |
| _sort_by_lengths | [u8; N] |
| _sort_order | [u8; N] |
| _limit | u32 |
| _offset | u32 |
| _status | u8 |
| _return_size | u32 |
| _placeholder_fields | [Field; S] |

### get_notes_oracle_wrapper

```rust
get_notes_oracle_wrapper(storage_slot, num_selects, select_by_indexes, select_by_offsets, select_by_lengths, select_values, select_comparators, sort_by_indexes, sort_by_offsets, sort_by_lengths, sort_order, limit, offset, status, mut placeholder_fields);
```

#### Parameters
| Name | Type |
| --- | --- |
| storage_slot | Field |
| num_selects | u8 |
| select_by_indexes | [u8; N] |
| select_by_offsets | [u8; N] |
| select_by_lengths | [u8; N] |
| select_values | [Field; N] |
| select_comparators | [u8; N] |
| sort_by_indexes | [u8; N] |
| sort_by_offsets | [u8; N] |
| sort_by_lengths | [u8; N] |
| sort_order | [u8; N] |
| limit | u32 |
| offset | u32 |
| status | u8 |
| mut placeholder_fields | [Field; S] |

### get_notes

```rust
get_notes(storage_slot, num_selects, select_by_indexes, select_by_offsets, select_by_lengths, select_values, select_comparators, sort_by_indexes, sort_by_offsets, sort_by_lengths, sort_order, limit, offset, status, mut placeholder_opt_notes, // TODO, // TODO);
```

#### Parameters
| Name | Type |
| --- | --- |
| storage_slot | Field |
| num_selects | u8 |
| select_by_indexes | [u8; M] |
| select_by_offsets | [u8; M] |
| select_by_lengths | [u8; M] |
| select_values | [Field; M] |
| select_comparators | [u8; M] |
| sort_by_indexes | [u8; M] |
| sort_by_offsets | [u8; M] |
| sort_by_lengths | [u8; M] |
| sort_order | [u8; M] |
| limit | u32 |
| offset | u32 |
| status | u8 |
| mut placeholder_opt_notes | [Option&lt;Note&gt;; S] |
| // TODO | Remove it and use `limit` to initialize the note array.
    placeholder_fields |
| // TODO | Remove it and use `limit` to initialize the note array.
    _placeholder_note_length |

### check_nullifier_exists_oracle

```rust
check_nullifier_exists_oracle(_inner_nullifier);
```

#### Parameters
| Name | Type |
| --- | --- |
| _inner_nullifier | Field |

### check_nullifier_exists

```rust
check_nullifier_exists(inner_nullifier);
```

#### Parameters
| Name | Type |
| --- | --- |
| inner_nullifier | Field |

