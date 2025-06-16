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

### insert

```rust
insert(self, note);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| note | Note |

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
remove(self, retrieved_note);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| retrieved_note | RetrievedNote&lt;Note&gt; |

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

