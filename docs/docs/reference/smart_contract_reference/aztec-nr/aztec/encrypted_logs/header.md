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

@todo Issue(#5901) Figure out if we return the bytes or fields for the log

```rust
EncryptedLogHeader::compute_ciphertext(self, secret, point);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| secret | GrumpkinPrivateKey |
| point | GrumpkinPoint |

## Standalone Functions

### test_encrypted_log_header

```rust
test_encrypted_log_header();
```

Takes no parameters.

