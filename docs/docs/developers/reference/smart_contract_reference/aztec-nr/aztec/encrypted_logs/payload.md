## Standalone Functions

### compute_private_log_payload

```rust
compute_private_log_payload(contract_address, recipient, sender, plaintext, );
```

Once the structure is finalized with defined overhead and max note field sizes, this value will be fixed and should remain unaffected by further payload composition changes.

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| recipient | AztecAddress |
| sender | AztecAddress |
| plaintext | [u8; P] |
|  |  |

### compute_partial_public_log_payload

```rust
compute_partial_public_log_payload(contract_address, recipient, sender, plaintext, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| recipient | AztecAddress |
| sender | AztecAddress |
| plaintext | [u8; P] |
|  |  |

### compute_encrypted_log

```rust
compute_encrypted_log(contract_address, recipient, plaintext, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| recipient | AztecAddress |
| plaintext | [u8; P] |
|  |  |

### extend_private_log_plaintext

```rust
extend_private_log_plaintext(plaintext);
```

Fill the remaining bytes with random values to reach a fixed length of N.

#### Parameters
| Name | Type |
| --- | --- |
| plaintext | [u8; P] |

### get_random_bytes

```rust
get_random_bytes();
```

Takes no parameters.

### fr_to_fq

```rust
fr_to_fq(r);
```

/ This is fine because modulus of the base field is smaller than the modulus of the scalar field.

#### Parameters
| Name | Type |
| --- | --- |
| r | Field |

### generate_ephemeral_key_pair

```rust
generate_ephemeral_key_pair();
```

Takes no parameters.

### compute_incoming_body_ciphertext

```rust
compute_incoming_body_ciphertext(plaintext, eph_sk, address_point, );
```

#### Parameters
| Name | Type |
| --- | --- |
| plaintext | [u8; P] |
| eph_sk | Scalar |
| address_point | AddressPoint |
|  |  |

### test_encrypted_log_matches_typescript

```rust
test_encrypted_log_matches_typescript();
```

Takes no parameters.

### test_incoming_body_ciphertext_matches_typescript

```rust
test_incoming_body_ciphertext_matches_typescript();
```

Takes no parameters.

