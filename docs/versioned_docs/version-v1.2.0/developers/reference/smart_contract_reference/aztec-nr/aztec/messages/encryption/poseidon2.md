## Standalone Functions

### poseidon2_encrypt

```rust
poseidon2_encrypt(msg, shared_secret, encryption_nonce, );
```

/// @param encryption_nonce is only needed if your use case needs to protect against replay attacks.

#### Parameters
| Name | Type |
| --- | --- |
| msg | [Field; L] |
| shared_secret | Point |
| encryption_nonce | Field |
|  |  |

### poseidon2_decrypt

```rust
poseidon2_decrypt(ciphertext);
```

#### Parameters
| Name | Type |
| --- | --- |
| ciphertext | [Field; ((L + 3 - 1 |

### encrypt_then_decrypt

```rust
encrypt_then_decrypt(msg);
```

Helper function that allows us to test encryption, then decryption, for various sizes of message.

#### Parameters
| Name | Type |
| --- | --- |
| msg | [Field; N] |

### poseidon2_encryption

```rust
poseidon2_encryption();
```

Takes no parameters.

### test_poseidon2_decryption_with_bad_secret_fails

```rust
test_poseidon2_decryption_with_bad_secret_fails();
```

Takes no parameters.

### encrypt_and_return_ct_length

```rust
encrypt_and_return_ct_length(msg);
```

Helper function with encryption boilerplate

#### Parameters
| Name | Type |
| --- | --- |
| msg | [Field; N] |

### test_ciphertext_lengths

```rust
test_ciphertext_lengths();
```

Takes no parameters.

### test_2_pow_128

```rust
test_2_pow_128();
```

Takes no parameters.

