## Standalone Functions

### compute_event_plaintext_for_this_strategy

```rust
compute_event_plaintext_for_this_strategy(event);
```

/ NB: The extra `+ 32` bytes is for the event_type_id:

#### Parameters
| Name | Type |
| --- | --- |
| event | Event |

### compute_log

```rust
compute_log(context, event, recipient, sender, );
```

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

context.

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

