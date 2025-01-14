# NoteHeader

## Fields
| Field | Type |
| --- | --- |
| pub contract_address | AztecAddress |
| pub nonce | Field |
| pub storage_slot | Field |
| pub note_hash_counter | u32, // a note_hash_counter of 0 means non-transient |

## Methods

### new

```rust
NoteHeader::new(contract_address, nonce, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| nonce | Field |
| storage_slot | Field |

## Standalone Functions

### empty

```rust
empty();
```

Takes no parameters.

### eq

```rust
eq(self, other);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| other | Self |

### serialize

```rust
serialize(self);
```

function --&gt; in that situation the serialize method is called by aztec-nr when computing an arguments hash.

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

