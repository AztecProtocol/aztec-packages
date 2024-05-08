# TestNote

## Fields
| Field | Type |
| --- | --- |
| header | NoteHeader |
| value | Field |

## Methods

### new

```rust
TestNote::new(value);
```

#### Parameters
| Name | Type |
| --- | --- |
| value | Field |

## Standalone Functions

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
| fields | [Field; TEST_NOTE_LENGTH] |

### compute_note_content_hash

```rust
compute_note_content_hash(self);
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

### compute_nullifier

```rust
compute_nullifier(self, _context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| _context | &mut PrivateContext |

### compute_nullifier_without_context

```rust
compute_nullifier_without_context(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

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

