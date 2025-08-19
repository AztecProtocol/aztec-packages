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
compute_log(note, storage_slot, recipient, sender, msg_type, );
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |
| storage_slot | Field |
| recipient | AztecAddress |
| sender | AztecAddress |
| msg_type | u64 |
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

### encode_and_encrypt_note_and_emit_as_offchain_message

```rust
encode_and_encrypt_note_and_emit_as_offchain_message(context, recipient, // We need this because to compute a tagging secret, we require a sender, );
```

/ `messages::offchain_message::emit_offchain_message` for more details on delivery guarantees.

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| recipient | AztecAddress |
| // We need this because to compute a tagging secret |  |
| we require a sender | sender |
|  |  |

