# TokenNoteProperties

/ Generates note properties struct for a given note struct `s`. / / Example: / ```

# TokenNoteFields_5695262104

/ Generates note export for a given note struct `s`. The export is a global variable that contains note type id, / note name and information about note fields (field name, index and whether the field is nullable or not). / / Example: / ```

# TokenNoteSetupPayload

/ Generates setup payload for a given note struct `s`. The setup payload contains log plaintext and hiding point. / / Example: / ```

## Methods

### new

```rust
TokenNoteSetupPayload::new(mut self, npk_m_hash, randomness, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| mut self |  |
| npk_m_hash | Field |
| randomness | Field |
| storage_slot | Field |

### encrypt_log

```rust
TokenNoteSetupPayload::encrypt_log(self, context, recipient_keys, recipient);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |
| recipient_keys | aztec |
| recipient | aztec |

### empty

```rust
TokenNoteSetupPayload::empty();
```

Takes no parameters.

### generate_setup_payload

```rust
TokenNoteSetupPayload::generate_setup_payload(s, indexed_fixed_fields, Type, u32);
```

#### Parameters
| Name | Type |
| --- | --- |
| s | StructDefinition |
| indexed_fixed_fields | [(Quoted |
| Type |  |
| u32 |  |

### new

```rust
TokenNoteSetupPayload::new($new_args);
```

#### Parameters
| Name | Type |
| --- | --- |
| $new_args |  |

### encrypt_log

```rust
TokenNoteSetupPayload::encrypt_log(self, context, recipient, sender);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |
| recipient | aztec |
| sender | aztec |

### empty

```rust
TokenNoteSetupPayload::empty();
```

Takes no parameters.

### get_setup_log_plaintext_body

```rust
TokenNoteSetupPayload::get_setup_log_plaintext_body(s, log_plaintext_length, indexed_nullable_fields, Type, u32);
```

#### Parameters
| Name | Type |
| --- | --- |
| s | StructDefinition |
| log_plaintext_length | u32 |
| indexed_nullable_fields | [(Quoted |
| Type |  |
| u32 |  |

### new

```rust
TokenNoteSetupPayload::new(mut self, context, slot, amount);
```

#### Parameters
| Name | Type |
| --- | --- |
| mut self |  |
| context | &mut aztec |
| slot | Field |
| amount | U128 |

### emit

```rust
TokenNoteSetupPayload::emit(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### emit_note_hash

```rust
TokenNoteSetupPayload::emit_note_hash(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### emit_log

```rust
TokenNoteSetupPayload::emit_log(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### empty

```rust
TokenNoteSetupPayload::empty();
```

Takes no parameters.

### generate_finalization_payload

```rust
TokenNoteSetupPayload::generate_finalization_payload(s, indexed_fixed_fields, Type, u32);
```

#### Parameters
| Name | Type |
| --- | --- |
| s | StructDefinition |
| indexed_fixed_fields | [(Quoted |
| Type |  |
| u32 |  |

### new

```rust
TokenNoteSetupPayload::new(mut self, context, slot, $args);
```

#### Parameters
| Name | Type |
| --- | --- |
| mut self |  |
| context | &mut aztec |
| slot | Field |
| $args |  |

### emit

```rust
TokenNoteSetupPayload::emit(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### emit_note_hash

```rust
TokenNoteSetupPayload::emit_note_hash(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### emit_log

```rust
TokenNoteSetupPayload::emit_log(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### empty

```rust
TokenNoteSetupPayload::empty();
```

Takes no parameters.

### setup_payload

```rust
TokenNoteSetupPayload::setup_payload();
```

Takes no parameters.

### finalization_payload

```rust
TokenNoteSetupPayload::finalization_payload();
```

Takes no parameters.

### generate_partial_note_impl

```rust
TokenNoteSetupPayload::generate_partial_note_impl(s, setup_payload_name, finalization_payload_name, );
```

#### Parameters
| Name | Type |
| --- | --- |
| s | StructDefinition |
| setup_payload_name | Quoted |
| finalization_payload_name | Quoted |
|  |  |

### setup_payload

```rust
TokenNoteSetupPayload::setup_payload();
```

Takes no parameters.

### finalization_payload

```rust
TokenNoteSetupPayload::finalization_payload();
```

Takes no parameters.

### register_note

```rust
TokenNoteSetupPayload::register_note(note, note_serialized_len, note_type_id, fixed_fields, Type, u32);
```

#### Parameters
| Name | Type |
| --- | --- |
| note | StructDefinition |
| note_serialized_len | u32 |
| note_type_id | Field |
| fixed_fields | [(Quoted |
| Type |  |
| u32 |  |

### index_note_fields

```rust
TokenNoteSetupPayload::index_note_fields(s, nullable_fields, );
```

#### Parameters
| Name | Type |
| --- | --- |
| s | StructDefinition |
| nullable_fields | [Quoted] |
|  |  |

### inject_note_header

```rust
TokenNoteSetupPayload::inject_note_header(s);
```

#### Parameters
| Name | Type |
| --- | --- |
| s | StructDefinition |

### partial_note

```rust
TokenNoteSetupPayload::partial_note(s, nullable_fields);
```

#### Parameters
| Name | Type |
| --- | --- |
| s | StructDefinition |
| nullable_fields | [Quoted] |

### note

```rust
TokenNoteSetupPayload::note(s);
```

#### Parameters
| Name | Type |
| --- | --- |
| s | StructDefinition |

### note_custom_interface

```rust
TokenNoteSetupPayload::note_custom_interface(s);
```

#### Parameters
| Name | Type |
| --- | --- |
| s | StructDefinition |

# TokenNoteFinalizationPayload

/ Generates finalization payload for a given note struct `s`. The finalization payload contains log and note hash. / / Example: / ```

## Methods

### new

```rust
TokenNoteFinalizationPayload::new(mut self, context, slot, amount);
```

#### Parameters
| Name | Type |
| --- | --- |
| mut self |  |
| context | &mut aztec |
| slot | Field |
| amount | U128 |

### emit

```rust
TokenNoteFinalizationPayload::emit(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### emit_note_hash

```rust
TokenNoteFinalizationPayload::emit_note_hash(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### emit_log

```rust
TokenNoteFinalizationPayload::emit_log(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

## Standalone Functions

### compute_note_type_id

```rust
compute_note_type_id(name);
```

#### Parameters
| Name | Type |
| --- | --- |
| name | Quoted |

### to_be_bytes

```rust
to_be_bytes(self, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| storage_slot | Field |

### deserialize_content

```rust
deserialize_content(value);
```

#### Parameters
| Name | Type |
| --- | --- |
| value | [Field; N] |

### serialize_content

```rust
serialize_content(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_note_type_id

```rust
get_note_type_id();
```

Takes no parameters.

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

### compute_note_hash

```rust
compute_note_hash(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### generate_note_interface

```rust
generate_note_interface(s, note_type_id, indexed_fixed_fields, Type, u32);
```

#### Parameters
| Name | Type |
| --- | --- |
| s | StructDefinition |
| note_type_id | Field |
| indexed_fixed_fields | [(Quoted |
| Type |  |
| u32 |  |

### to_be_bytes

```rust
to_be_bytes(self, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| storage_slot | Field |

### deserialize_content

```rust
deserialize_content(value);
```

#### Parameters
| Name | Type |
| --- | --- |
| value | [Field; $content_len] |

### serialize_content

```rust
serialize_content(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_note_type_id

```rust
get_note_type_id();
```

Takes no parameters.

### set_header

```rust
set_header(&mut self, header);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| header | $NOTE_HEADER_TYPE |

### get_header

```rust
get_header(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### compute_note_hash

```rust
compute_note_hash(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

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
| s | StructDefinition |

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
| s | StructDefinition |
| note_type_id | Field |
| fields | [(Quoted |
| u32 |  |
| bool |  |

### generate_multi_scalar_mul

```rust
generate_multi_scalar_mul(indexed_fields, Type, u32);
```

#### Parameters
| Name | Type |
| --- | --- |
| indexed_fields | [(Quoted |
| Type |  |
| u32 |  |

