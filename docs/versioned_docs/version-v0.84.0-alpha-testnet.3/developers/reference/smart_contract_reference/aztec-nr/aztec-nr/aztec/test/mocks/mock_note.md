# MockNote

## Fields
| Field | Type |
| --- | --- |
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
| note_metadata | Option&lt;NoteMetadata&gt; |

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

### note_metadata

```rust
MockNoteBuilder::note_metadata(&mut self, note_metadata);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| note_metadata | NoteMetadata |

### build_note

```rust
MockNoteBuilder::build_note(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### build_retrieved_note

```rust
MockNoteBuilder::build_retrieved_note(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

## Standalone Functions

### get_id

```rust
get_id();
```

Takes no parameters.

### compute_note_hash

```rust
compute_note_hash(self, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |
| storage_slot | Field |

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

### compute_nullifier_unconstrained

```rust
compute_nullifier_unconstrained(self, note_hash_for_nullify);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| note_hash_for_nullify | Field |

