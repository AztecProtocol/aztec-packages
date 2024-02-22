# FieldNote

A note which stores a field and is expected to be passed around using the `addNote` function. WARNING: This Note is not private as it does not contain randomness and hence it can be easy to perform serialized_note attack on it.

## Fields
| Field | Type |
| --- | --- |
| value | Field |
| header | NoteHeader |

## Methods

### new

```rust
FieldNote::new(value);
```

#### Parameters
| Name | Type |
| --- | --- |
| value | Field |

#### Returns
| Type |
| --- |
| Self |

## Standalone Functions

### serialize_content

```rust
serialize_content(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Field; FIELD_NOTE_LEN] |

### deserialize_content

```rust
deserialize_content(serialized_note);
```

#### Parameters
| Name | Type |
| --- | --- |
| serialized_note | [Field; FIELD_NOTE_LEN] |

#### Returns
| Type |
| --- |
| Self |

### compute_note_content_hash

```rust
compute_note_content_hash(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Field |

### compute_nullifier

```rust
compute_nullifier(self, _context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| _context | &mut PrivateContext |

#### Returns
| Type |
| --- |
| Field |

### compute_nullifier_without_context

```rust
compute_nullifier_without_context(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Field |

### set_header

```rust
set_header(&mut self, header);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| header | NoteHeader |

### get_header

```rust
get_header(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| NoteHeader |

### broadcast

```rust
broadcast(self, context, slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |
| slot | Field |

### get_note_type_id

```rust
get_note_type_id();
```

Takes no parameters.

#### Returns
| Type |
| --- |
| Field |

