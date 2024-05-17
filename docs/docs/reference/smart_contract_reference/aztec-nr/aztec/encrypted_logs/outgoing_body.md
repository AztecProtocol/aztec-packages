# EncryptedLogOutgoingBody

## Fields
| Field | Type |
| --- | --- |
| eph_sk | GrumpkinPrivateKey |
| recipient | AztecAddress |
| recipient_ivpk_app | GrumpkinPoint |

## Methods

### new

```rust
EncryptedLogOutgoingBody::new(eph_sk, recipient, recipient_ivpk_app);
```

#### Parameters
| Name | Type |
| --- | --- |
| eph_sk | GrumpkinPrivateKey |
| recipient | AztecAddress |
| recipient_ivpk_app | GrumpkinPoint |

### compute_ciphertext

```rust
EncryptedLogOutgoingBody::compute_ciphertext(self, ovsk_app, eph_pk);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| ovsk_app | GrumpkinPrivateKey |
| eph_pk | GrumpkinPoint |

## Standalone Functions

### test_encrypted_log_outgoing_body

```rust
test_encrypted_log_outgoing_body();
```

Takes no parameters.

