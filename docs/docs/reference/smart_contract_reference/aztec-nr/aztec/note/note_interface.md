## Standalone Functions

### compute_note_hash_and_nullifier

```rust
compute_note_hash_and_nullifier(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |

### compute_note_hash_and_nullifier_without_context

```rust
compute_note_hash_and_nullifier_without_context(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### serialize_content

```rust
serialize_content(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### deserialize_content

```rust
deserialize_content(fields);
```

#### Parameters
| Name | Type |
| --- | --- |
| fields | [Field; N] |

### compute_note_hiding_point

```rust
compute_note_hiding_point(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_header

```rust
get_header(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### set_header

```rust
set_header(&mut self, header);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| header | NoteHeader |

### get_note_type_id

```rust
get_note_type_id();
```

Takes no parameters.

### to_be_bytes

```rust
to_be_bytes(self, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| storage_slot | Field |

