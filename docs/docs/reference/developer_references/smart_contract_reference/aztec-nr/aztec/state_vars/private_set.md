## Standalone Functions

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
get_notes(self, options, N, M, FILTER_ARGS>);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| options | NoteGetterOptions&lt;Note |
| N |  |
| M |  |
| FILTER_ARGS&gt; |  |

### view_notes

```rust
view_notes(self, options, N, M>);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| options | NoteViewerOptions&lt;Note |
| N |  |
| M&gt; |  |

