## Standalone Functions

### compute_payload

```rust
compute_payload(context, event, recipient, sender, );
```

/ Computes private event log payload and a log hash

#### Parameters
| Name | Type |
| --- | --- |
| context | PrivateContext |
| event | Event |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

### compute_payload_unconstrained

```rust
compute_payload_unconstrained(context, event, recipient, sender, );
```

#### Parameters
| Name | Type |
| --- | --- |
| context | PrivateContext |
| event | Event |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

### encode_and_encrypt_event

```rust
encode_and_encrypt_event(context, recipient, sender, );
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

### encode_and_encrypt_event_unconstrained

```rust
encode_and_encrypt_event_unconstrained(context, recipient, sender, );
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

