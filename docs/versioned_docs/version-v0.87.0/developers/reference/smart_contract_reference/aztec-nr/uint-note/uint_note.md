# UintNote

## Fields
| Field | Type |
| --- | --- |
| owner | AztecAddress |
| randomness | Field |
| value | u128 |

## Methods

### new

```rust
UintNote::new(value, owner);
```

#### Parameters
| Name | Type |
| --- | --- |
| value | u128 |
| owner | AztecAddress |

### get_value

```rust
UintNote::get_value(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### partial

/ Creates a partial note that will hide the owner and storage slot but not the value, since the note will be later / completed in public. This is a powerful technique for scenarios in which the value cannot be known in private / (e.g. because it depends on some public state, such as a DEX). /// The returned `PartialUintNote` value must be sent to public execution via a secure channel, since it is not / possible to verify the integrity of its contents due to it hiding information. The recommended ways to do this / are to retrieve it from public storage, or to receive it in an internal public function call. /// Each partial note should only be used once, since otherwise multiple notes would be linked together and known to / belong to the same owner. /// As part of the partial note creation process, a log will be sent to `recipient` from `sender` so that they can / discover the note. `recipient` will typically be the same as `owner`.

```rust
UintNote::partial(owner, storage_slot, context, recipient, sender, );
```

#### Parameters
| Name | Type |
| --- | --- |
| owner | AztecAddress |
| storage_slot | Field |
| context | &mut PrivateContext |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

# UintPartialNotePrivateContent

## Fields
| Field | Type |
| --- | --- |
| owner | AztecAddress |
| randomness | Field |

## Methods

### compute_partial_commitment

```rust
UintPartialNotePrivateContent::compute_partial_commitment(self, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| storage_slot | Field |

# PrivateUintPartialNotePrivateLogContent

## Fields
| Field | Type |
| --- | --- |
| public_log_tag | Field |
| owner | AztecAddress |
| randomness | Field |

# PartialUintNote

## Fields
| Field | Type |
| --- | --- |
| commitment | Field |

## Methods

### commitment

```rust
PartialUintNote::commitment(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### complete

/ Completes the partial note, creating a new note that can be used like any other UintNote.

```rust
PartialUintNote::complete(self, value, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| value | u128 |
| context | &mut PublicContext |

### compute_note_completion_log

```rust
PartialUintNote::compute_note_completion_log(self, value);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| value | u128 |

### compute_complete_note_hash

```rust
PartialUintNote::compute_complete_note_hash(self, value);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| value | u128 |

## Standalone Functions

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

#[note] macro.

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |
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

### get_id

```rust
get_id();
```

Takes no parameters.

### note_hash_matches_completed_partial_note_hash

```rust
note_hash_matches_completed_partial_note_hash();
```

Takes no parameters.

### unpack_from_partial_note_encoding

```rust
unpack_from_partial_note_encoding();
```

Takes no parameters.

