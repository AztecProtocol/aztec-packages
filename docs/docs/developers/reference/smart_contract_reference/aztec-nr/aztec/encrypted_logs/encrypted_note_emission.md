## Standalone Functions

### compute_payload

```rust
compute_payload(context, note, recipient, sender, );
```

/ Computes private note log payload

#### Parameters
| Name | Type |
| --- | --- |
| context | PrivateContext |
| note | Note |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

### compute_payload_unconstrained

```rust
compute_payload_unconstrained(context, note, recipient, sender, );
```

#### Parameters
| Name | Type |
| --- | --- |
| context | PrivateContext |
| note | Note |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

### encode_and_encrypt_note

```rust
encode_and_encrypt_note(context, recipient, // We need this because to compute a tagging secret, we require a sender, );
```

If you get weird behavior it might be because of it.

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

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| recipient | AztecAddress |
| // We need this because to compute a tagging secret |  |
| we require a sender | sender |
|  |  |

