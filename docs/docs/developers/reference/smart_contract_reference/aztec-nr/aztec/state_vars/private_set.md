## Standalone Functions

### get_storage_slot

```rust
get_storage_slot(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### new

```rust
new(context, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | Context |
| storage_slot | Field |

### insert_from_public

```rust
insert_from_public(self, note);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| note | &mut Note |

### insert

```rust
insert(self, note);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| note | &mut Note |

### pop_notes

```rust
pop_notes(self, options, N, PREPROCESSOR_ARGS, FILTER_ARGS>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| options | NoteGetterOptions&lt;Note |
| N |  |
| PREPROCESSOR_ARGS |  |
| FILTER_ARGS&gt; |  |
|  |  |

### remove

```rust
remove(self, note);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| note | Note |

### get_notes

```rust
get_notes(self, options, N, PREPROCESSOR_ARGS, FILTER_ARGS>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| options | NoteGetterOptions&lt;Note |
| N |  |
| PREPROCESSOR_ARGS |  |
| FILTER_ARGS&gt; |  |
|  |  |

### view_notes

```rust
view_notes(self, options, N>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| options | NoteViewerOptions&lt;Note |
| N&gt; |  |
|  |  |

