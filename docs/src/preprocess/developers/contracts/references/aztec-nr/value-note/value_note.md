# ValueNote

## Fields
| Field | Type |
| --- | --- |
| value | Field |
| owner | AztecAddress |
| randomness | Field |
| header | NoteHeader |

## Methods

### new

```rust
ValueNote::new(value, owner);
```

#### Parameters
| Name | Type |
| --- | --- |
| value | Field |
| owner | AztecAddress |

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
| Field; VALUE_NOTE_LEN] |

### deserialize_content

```rust
deserialize_content(serialized_note);
```

#### Parameters
| Name | Type |
| --- | --- |
| serialized_note | [Field; VALUE_NOTE_LEN] |

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
compute_nullifier(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |

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

