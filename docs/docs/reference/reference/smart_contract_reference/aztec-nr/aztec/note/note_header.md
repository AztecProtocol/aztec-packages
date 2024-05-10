# NoteHeader

## Fields
| Field | Type |
| --- | --- |
| contract_address | AztecAddress |
| nonce | Field |
| storage_slot | Field |
| is_transient | bool |

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

### serialize

```rust
serialize(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

