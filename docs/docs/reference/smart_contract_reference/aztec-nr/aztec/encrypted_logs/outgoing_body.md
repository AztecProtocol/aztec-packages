# EncryptedLogOutgoingBody

## Fields
| Field | Type |
| --- | --- |
| eph_sk | Scalar |
| recipient | AztecAddress |
| recipient_ivpk | Point |

## Methods

### new

```rust
EncryptedLogOutgoingBody::new(eph_sk, recipient, recipient_ivpk);
```

#### Parameters
| Name | Type |
| --- | --- |
| eph_sk | Scalar |
| recipient | AztecAddress |
| recipient_ivpk | Point |

### compute_ciphertext

/ Encrypts ephemeral secret key and recipient's ivpk --&gt; with this information the recipient of outgoing will / be able to derive the key with which the incoming log can be decrypted.

```rust
EncryptedLogOutgoingBody::compute_ciphertext(self, ovsk_app, eph_pk);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| ovsk_app | Scalar |
| eph_pk | Point |

## Standalone Functions

### test_encrypted_log_outgoing_body_matches_typescript

```rust
test_encrypted_log_outgoing_body_matches_typescript();
```

Takes no parameters.

