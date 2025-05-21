## Standalone Functions

### compute_log

```rust
compute_log(event, recipient, sender, );
```

#### Parameters
| Name | Type |
| --- | --- |
| event | Event |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

### compute_log_unconstrained

```rust
compute_log_unconstrained(event, recipient, sender, );
```

#### Parameters
| Name | Type |
| --- | --- |
| event | Event |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

### encode_and_encrypt_event

```rust
encode_and_encrypt_event(context, recipient, sender, );
```

/ private logs.

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

/// Only use this function in scenarios where the recipient not receiving the event is an acceptable outcome.

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

