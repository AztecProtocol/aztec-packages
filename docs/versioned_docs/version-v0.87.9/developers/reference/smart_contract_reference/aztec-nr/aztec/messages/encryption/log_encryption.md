## Standalone Functions

### encrypt_log

```rust
encrypt_log(plaintext, recipient, );
```

/ Fixed-size array of encrypted Field elements representing the private log

#### Parameters
| Name | Type |
| --- | --- |
| plaintext | [Field; PLAINTEXT_LEN] |
| recipient | AztecAddress |
|  |  |

### decrypt_log

```rust
decrypt_log(ciphertext, PRIVATE_LOG_CIPHERTEXT_LEN>, recipient, );
```

#### Parameters
| Name | Type |
| --- | --- |
| ciphertext | BoundedVec&lt;Field |
| PRIVATE_LOG_CIPHERTEXT_LEN&gt; |  |
| recipient | AztecAddress |
|  |  |

