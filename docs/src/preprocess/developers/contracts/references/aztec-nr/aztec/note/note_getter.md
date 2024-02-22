## Standalone Functions

### check_note_fields

```rust
check_note_fields(fields, selects, N>);
```

#### Parameters
| Name | Type |
| --- | --- |
| fields | [Field; N] |
| selects | BoundedVec&lt;Option&lt;Select&gt; |
| N&gt; |  |

### get_note_internal

```rust
get_note_internal(storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| storage_slot | Field |

#### Returns
| Type |
| --- |
| Note where Note: NoteInterface&lt;N&gt; |

