# EncryptedLogHeader

## Fields
| Field | Type |
| --- | --- |
| address | AztecAddress |

## Methods

### new

```rust
EncryptedLogHeader::new(address);
```

#### Parameters
| Name | Type |
| --- | --- |
| address | AztecAddress |

### compute_ciphertext

```rust
EncryptedLogHeader::compute_ciphertext(self, secret, pk);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| secret | Scalar |
| pk | T |

## Standalone Functions

### test_encrypted_log_header_matches_noir

```rust
test_encrypted_log_header_matches_noir();
```

Takes no parameters.

