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

/ circuits.

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

### pack_content

```rust
pack_content(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### unpack_content

```rust
unpack_content(fields);
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

### compute_note_hash

```rust
compute_note_hash(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

