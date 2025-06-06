# PrivateLogContentConstraintsEnum

## Fields
| Field | Type |
| --- | --- |
| pub NO_CONSTRAINTS | u8 |
| pub CONSTRAINED_ENCRYPTION | u8 |

## Standalone Functions

### emit_event_in_private_log

```rust
emit_event_in_private_log(event, context, sender, recipient, constraints, );
```

/ each value in `PrivateLogContentConstraintsEnum` to learn more about the different variants.

#### Parameters
| Name | Type |
| --- | --- |
| event | Event |
| context | &mut PrivateContext |
| sender | AztecAddress |
| recipient | AztecAddress |
| constraints | u8 |
|  |  |

### emit_event_in_public_log

```rust
emit_event_in_public_log(event, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| event | Event |
| context | &mut PublicContext |

### get_event_type_id

```rust
get_event_type_id();
```

Takes no parameters.

