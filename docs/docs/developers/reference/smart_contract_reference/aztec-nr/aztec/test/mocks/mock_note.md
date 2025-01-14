# MockNote

## Fields
| Field | Type |
| --- | --- |
| pub(crate) header | NoteHeader |
| pub(crate) value | Field |

## Methods

### new

```rust
MockNote::new(value);
```

#### Parameters
| Name | Type |
| --- | --- |
| value | Field |

# MockNoteBuilder

## Fields
| Field | Type |
| --- | --- |
| value | Field |
| contract_address | Option&lt;AztecAddress&gt; |
| storage_slot | Option&lt;Field&gt; |

## Methods

### new

```rust
MockNoteBuilder::new(value);
```

#### Parameters
| Name | Type |
| --- | --- |
| value | Field |

### contract_address

```rust
MockNoteBuilder::contract_address(&mut self, contract_address);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| contract_address | AztecAddress |

### storage_slot

```rust
MockNoteBuilder::storage_slot(&mut self, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| storage_slot | Field |

### build

```rust
MockNoteBuilder::build(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

## Standalone Functions

### compute_nullifier

```rust
compute_nullifier(_self, _context, note_hash_for_nullify, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| _context | &mut PrivateContext |
| note_hash_for_nullify | Field |
|  |  |

### compute_nullifier_without_context

```rust
compute_nullifier_without_context(self);
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
| fields | [Field; MOCK_NOTE_LENGTH] |

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

### compute_note_hash

```rust
compute_note_hash(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |

### eq

```rust
eq(self, other);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| other | Self |

