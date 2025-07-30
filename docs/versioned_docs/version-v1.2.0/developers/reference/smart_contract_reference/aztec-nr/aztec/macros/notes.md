# TokenNoteProperties

/ Generates note properties struct for a given note struct `s`. / / Example: / ```

# TokenNoteFields_5695262104

/ Generates note export for a given note struct `s`. The export is a global variable that contains note type id, / note name and information about note fields (field name, index and whether the field is nullable or not). / / Example: / ```

# CustomNote

/ Generates code for a custom note implementation that requires specialized note hash or nullifier computation. / / # Generated Code / - NoteTypeProperties: Defines the structure and properties of note fields / - NoteType trait implementation: Provides the note type ID / - Packable implementation: Enables serialization/deserialization of the note / / # Registration / Registers the note in the global `NOTES` map with: / - Note type ID / - Packed length / - Field indices and nullability / / # Use Cases / Use this macro when implementing a note that needs custom: / - Note hash computation logic / - Nullifier computation logic / / The macro omits generating default NoteHash trait implementation, allowing you to provide your own. / / # Example / ``` / #[custom_note]

## Standalone Functions

### get_next_note_type_id

```rust
get_next_note_type_id();
```

Takes no parameters.

### derive_packable_if_not_implemented_and_get_len

```rust
derive_packable_if_not_implemented_and_get_len(s);
```

#### Parameters
| Name | Type |
| --- | --- |
| s | TypeDefinition |

### get_id

```rust
get_id();
```

Takes no parameters.

### generate_note_interface

```rust
generate_note_interface(s, note_type_id);
```

#### Parameters
| Name | Type |
| --- | --- |
| s | TypeDefinition |
| note_type_id | Field |

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
| self |  |
| storage_slot | Field |

### compute_nullifier

```rust
compute_nullifier(self, context, note_hash_for_nullify);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |
| note_hash_for_nullify | Field |

### compute_nullifier_unconstrained

```rust
compute_nullifier_unconstrained(note_hash_for_nullify);
```

#### Parameters
| Name | Type |
| --- | --- |
| note_hash_for_nullify | Field |

### generate_note_hash_trait_impl

```rust
generate_note_hash_trait_impl(s);
```

#### Parameters
| Name | Type |
| --- | --- |
| s | TypeDefinition |

### compute_note_hash

```rust
compute_note_hash(self, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| storage_slot | Field |

### compute_nullifier

```rust
compute_nullifier(self, context, note_hash_for_nullify, );
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut aztec |
| note_hash_for_nullify | Field |
|  |  |

### compute_nullifier_unconstrained

```rust
compute_nullifier_unconstrained(self, note_hash_for_nullify, );
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| note_hash_for_nullify | Field |
|  |  |

### properties

```rust
properties();
```

Takes no parameters.

### generate_note_properties

```rust
generate_note_properties(s);
```

#### Parameters
| Name | Type |
| --- | --- |
| s | TypeDefinition |

### properties

```rust
properties();
```

Takes no parameters.

### generate_note_export

```rust
generate_note_export(s, note_type_id, fields, u32, bool);
```

#### Parameters
| Name | Type |
| --- | --- |
| s | TypeDefinition |
| note_type_id | Field |
| fields | [(Quoted |
| u32 |  |
| bool |  |

### register_note

```rust
register_note(note, note_packed_len, note_type_id, fixed_fields, Type, u32);
```

#### Parameters
| Name | Type |
| --- | --- |
| note | TypeDefinition |
| note_packed_len | u32 |
| note_type_id | Field |
| fixed_fields | [(Quoted |
| Type |  |
| u32 |  |

### index_note_fields

```rust
index_note_fields(s, nullable_fields, );
```

#### Parameters
| Name | Type |
| --- | --- |
| s | TypeDefinition |
| nullable_fields | [Quoted] |
|  |  |

### note

```rust
note(s);
```

#### Parameters
| Name | Type |
| --- | --- |
| s | TypeDefinition |

### compute_note_hash

```rust
compute_note_hash(.);
```

#### Parameters
| Name | Type |
| --- | --- |
| . |  |

### compute_nullifier

```rust
compute_nullifier(.);
```

#### Parameters
| Name | Type |
| --- | --- |
| . |  |

### compute_nullifier_unconstrained

```rust
compute_nullifier_unconstrained(.);
```

#### Parameters
| Name | Type |
| --- | --- |
| . |  |

### custom_note

```rust
custom_note(s);
```

#### Parameters
| Name | Type |
| --- | --- |
| s | TypeDefinition |

### assert_has_owner

```rust
assert_has_owner(note);
```

#### Parameters
| Name | Type |
| --- | --- |
| note | TypeDefinition |

