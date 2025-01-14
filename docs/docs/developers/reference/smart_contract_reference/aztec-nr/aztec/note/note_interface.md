## Standalone Functions

### properties

```rust
properties();
```

Takes no parameters.

### setup_payload

```rust
setup_payload();
```

Takes no parameters.

### finalization_payload

```rust
finalization_payload();
```

Takes no parameters.

### compute_nullifier

```rust
compute_nullifier(self, context, note_hash_for_nullify);
```

gate count of the circuit.

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |
| note_hash_for_nullify | Field |

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
| fields | [Field; N] |

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
| self |  |

