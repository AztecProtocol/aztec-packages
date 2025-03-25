## Standalone Functions

### compute_event_plaintext_for_this_strategy

```rust
compute_event_plaintext_for_this_strategy(event);
```

/ NB: The extra `+ 1` is for the event_type_id:

#### Parameters
| Name | Type |
| --- | --- |
| event | Event |

### compute_log

```rust
compute_log(context, event, recipient, sender, );
```

we perform some note-specific log length assertions.

#### Parameters
| Name | Type |
| --- | --- |
| context | PrivateContext |
| event | Event |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

### compute_log_unconstrained

```rust
compute_log_unconstrained(context, event, recipient, sender, );
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

