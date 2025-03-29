## Standalone Functions

### encrypt_log

```rust
encrypt_log(contract_address, plaintext, recipient, sender, );
```

/ 4. Format into final log structure with padding

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| plaintext | [Field; PT] |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

### decrypt_log

```rust
decrypt_log(log, PRIVATE_LOG_SIZE_IN_FIELDS>, recipient, );
```

#### Parameters
| Name | Type |
| --- | --- |
| log | BoundedVec&lt;Field |
| PRIVATE_LOG_SIZE_IN_FIELDS&gt; |  |
| recipient | AztecAddress |
|  |  |

### encrypt_decrypt_log

```rust
encrypt_decrypt_log();
```

Takes no parameters.

