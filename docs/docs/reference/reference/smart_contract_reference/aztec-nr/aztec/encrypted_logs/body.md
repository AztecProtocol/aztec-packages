# AddressNote

## Fields
| Field | Type |
| --- | --- |
| address | AztecAddress |
| owner | AztecAddress |
| randomness | Field |
| header | NoteHeader |

## Methods

### new

```rust
AddressNote::new(address, owner, randomness);
```

#### Parameters
| Name | Type |
| --- | --- |
| address | AztecAddress |
| owner | AztecAddress |
| randomness | Field |

## Standalone Functions

### compute_ciphertext

```rust
compute_ciphertext(self, secret, point);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| secret | GrumpkinPrivateKey |
| point | GrumpkinPoint |

### compute_note_content_hash

```rust
compute_note_content_hash(self);
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

### compute_nullifier

```rust
compute_nullifier(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |

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
| fields | [Field; ADDRESS_NOTE_LEN] |

### test_encrypted_log_body

```rust
test_encrypted_log_body();
```

Takes no parameters.

