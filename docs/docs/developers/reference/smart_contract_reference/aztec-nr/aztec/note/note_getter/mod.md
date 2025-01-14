## Standalone Functions

### extract_property_value_from_selector

```rust
extract_property_value_from_selector(serialized_note, selector, );
```

#### Parameters
| Name | Type |
| --- | --- |
| serialized_note | [Field; N] |
| selector | PropertySelector |
|  |  |

### check_note_header

```rust
check_note_header(context, storage_slot, note);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | PrivateContext |
| storage_slot | Field |
| note | Note |

### check_note_fields

```rust
check_note_fields(serialized_note, selects, N>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| serialized_note | [Field; N] |
| selects | BoundedVec&lt;Option&lt;Select&gt; |
| N&gt; |  |
|  |  |

### check_notes_order

```rust
check_notes_order(fields_0, fields_1, sorts, N>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| fields_0 | [Field; N] |
| fields_1 | [Field; N] |
| sorts | BoundedVec&lt;Option&lt;Sort&gt; |
| N&gt; |  |
|  |  |

### get_note

```rust
get_note(context, storage_slot, );
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| storage_slot | Field |
|  |  |

### get_notes

```rust
get_notes(context, storage_slot, options, N, PREPROCESSOR_ARGS, FILTER_ARGS>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| storage_slot | Field |
| options | NoteGetterOptions&lt;Note |
| N |  |
| PREPROCESSOR_ARGS |  |
| FILTER_ARGS&gt; |  |
|  |  |

### apply_preprocessor

```rust
apply_preprocessor(notes, preprocessor, PREPROCESSOR_ARGS);
```

#### Parameters
| Name | Type |
| --- | --- |
| notes | [Option&lt;Note&gt;; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] |
| preprocessor | fn([Option&lt;Note&gt;; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] |
| PREPROCESSOR_ARGS |  |

### constrain_get_notes_internal

```rust
constrain_get_notes_internal(context, storage_slot, opt_notes, options, N, PREPROCESSOR_ARGS, FILTER_ARGS>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| storage_slot | Field |
| opt_notes | [Option&lt;Note&gt;; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] |
| options | NoteGetterOptions&lt;Note |
| N |  |
| PREPROCESSOR_ARGS |  |
| FILTER_ARGS&gt; |  |
|  |  |

### get_note_internal

```rust
get_note_internal(storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| storage_slot | Field |

### get_notes_internal

```rust
get_notes_internal(storage_slot, options, N, PREPROCESSOR_ARGS, FILTER_ARGS>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| storage_slot | Field |
| options | NoteGetterOptions&lt;Note |
| N |  |
| PREPROCESSOR_ARGS |  |
| FILTER_ARGS&gt; |  |
|  |  |

### view_notes

```rust
view_notes(storage_slot, options, N>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| storage_slot | Field |
| options | NoteViewerOptions&lt;Note |
| N&gt; |  |
|  |  |

### flatten_options

```rust
flatten_options(selects, N>, sorts, N>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| selects | BoundedVec&lt;Option&lt;Select&gt; |
| N&gt; |  |
| sorts | BoundedVec&lt;Option&lt;Sort&gt; |
| N&gt; |  |
|  |  |

