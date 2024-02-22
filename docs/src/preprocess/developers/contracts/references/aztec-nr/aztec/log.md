## Standalone Functions

### emit_unencrypted_log

```rust
emit_unencrypted_log(context, log);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PublicContext |
| log | T |

### emit_unencrypted_log_from_private

```rust
emit_unencrypted_log_from_private(context, log);
```

If we decide to keep this function around would make sense to wait for traits and then merge it with emit_unencrypted_log.

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| log | T |

