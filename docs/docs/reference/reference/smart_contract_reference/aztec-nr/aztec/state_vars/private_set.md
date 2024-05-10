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

### insert

```rust
insert(self, note, broadcast);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| note | &mut Note |
| broadcast | bool |

### insert_from_public

```rust
insert_from_public(self, note);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| note | &mut Note |

### assert_contains_and_remove

```rust
assert_contains_and_remove(_self, _note, _nonce);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| _note | &mut Note |
| _nonce | Field |

### assert_contains_and_remove_publicly_created

```rust
assert_contains_and_remove_publicly_created(_self, _note);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| _note | &mut Note |

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
get_notes(self, options, N, FILTER_ARGS>);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| options | NoteGetterOptions&lt;Note |
| N |  |
| FILTER_ARGS&gt; |  |

### view_notes

```rust
view_notes(self, options, N>);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| options | NoteViewerOptions&lt;Note |
| N&gt; |  |

