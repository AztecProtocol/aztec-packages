## Standalone Functions

### assert_note_exists

```rust
assert_note_exists(context, note_hash_counter);
```

TODO: it feels like this existence check is in the wrong place. In fact, why is it needed at all? Under what circumstances have we found a non-existent note being emitted accidentally?

#### Parameters
| Name | Type |
| --- | --- |
| context | PrivateContext |
| note_hash_counter | u32 |

### compute_note_plaintext_for_this_strategy

```rust
compute_note_plaintext_for_this_strategy(note, storage_slot, log_type_id, );
```

/ NB: The "2" in "N + 2" is for the note_id and the storage_slot of the note:

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |
| storage_slot | Field |
| log_type_id | u64 |
|  |  |

### compute_note_log

```rust
compute_note_log(note, storage_slot, recipient, sender, );
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |
| storage_slot | Field |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

### compute_partial_note_log

```rust
compute_partial_note_log(note, storage_slot, recipient, sender, );
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |
| storage_slot | Field |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

### compute_log

```rust
compute_log(note, storage_slot, recipient, sender, log_type_id, );
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |
| storage_slot | Field |
| recipient | AztecAddress |
| sender | AztecAddress |
| log_type_id | u64 |
|  |  |

### prefix_with_tag

```rust
prefix_with_tag(log_without_tag, sender, recipient, );
```

#### Parameters
| Name | Type |
| --- | --- |
| log_without_tag | [Field; L] |
| sender | AztecAddress |
| recipient | AztecAddress |
|  |  |

### compute_note_log_unconstrained

```rust
compute_note_log_unconstrained(note, storage_slot, recipient, sender, );
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |
| storage_slot | Field |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

### encode_and_encrypt_note

```rust
encode_and_encrypt_note(context, recipient, // We need this because to compute a tagging secret, we require a sender, );
```

/ private logs.

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| recipient | AztecAddress |
| // We need this because to compute a tagging secret |  |
| we require a sender | sender |
|  |  |

### encode_and_encrypt_note_unconstrained

```rust
encode_and_encrypt_note_unconstrained(context, recipient, // We need this because to compute a tagging secret, we require a sender, );
```

/// Only use this function in scenarios where the recipient not receiving the note is an acceptable outcome.

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| recipient | AztecAddress |
| // We need this because to compute a tagging secret |  |
| we require a sender | sender |
|  |  |

### prefixing_with_tag

```rust
prefixing_with_tag();
```

Takes no parameters.

