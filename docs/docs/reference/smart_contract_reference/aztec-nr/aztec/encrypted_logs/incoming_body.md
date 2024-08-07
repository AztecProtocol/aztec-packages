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

# TestEvent

## Fields
| Field | Type |
| --- | --- |
| value0 | Field |
| value1 | Field |
| value2 | Field |

## Standalone Functions

### from_note

```rust
from_note(note, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| note | T |
| storage_slot | Field |

### from_event

```rust
from_event(event, randomness);
```

#### Parameters
| Name | Type |
| --- | --- |
| event | T |
| randomness | Field |

### compute_ciphertext

```rust
compute_ciphertext(self, eph_sk, ivpk);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| eph_sk | Scalar |
| ivpk | Point |

### compute_note_hiding_point

```rust
compute_note_hiding_point(self);
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

### compute_note_hash_and_nullifier

```rust
compute_note_hash_and_nullifier(_self, _context);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| _context | &mut PrivateContext |

### compute_note_hash_and_nullifier_without_context

```rust
compute_note_hash_and_nullifier_without_context(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

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

### to_be_bytes

```rust
to_be_bytes(self, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| storage_slot | Field |

### test_encrypted_note_log_incoming_body_matches_typescript

```rust
test_encrypted_note_log_incoming_body_matches_typescript();
```

Takes no parameters.

### serialize

```rust
serialize(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_event_type_id

```rust
get_event_type_id();
```

Takes no parameters.

### private_to_be_bytes

```rust
private_to_be_bytes(self, randomness);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| randomness | Field |

### to_be_bytes

```rust
to_be_bytes(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### emit

```rust
emit(self, _emit);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| _emit | fn[Env](Self |

### test_encrypted_log_event_incoming_body

```rust
test_encrypted_log_event_incoming_body();
```

Takes no parameters.

