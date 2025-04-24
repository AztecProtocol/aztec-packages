## Standalone Functions

### derive_ecdh_shared_secret

```rust
derive_ecdh_shared_secret(secret, public_key);
```

See also: https://en.wikipedia.org/wiki/Elliptic-curve_Diffie%E2%80%93Hellman

#### Parameters
| Name | Type |
| --- | --- |
| secret | Scalar |
| public_key | Point |

### derive_ecdh_shared_secret_using_aztec_address

```rust
derive_ecdh_shared_secret_using_aztec_address(ephemeral_secret, recipient_address, );
```

/ given the address of their intended recipient.

#### Parameters
| Name | Type |
| --- | --- |
| ephemeral_secret | Scalar |
| recipient_address | AztecAddress |
|  |  |

### test_consistency_with_typescript

```rust
test_consistency_with_typescript();
```

Takes no parameters.

### test_shared_secret_computation_in_both_directions

```rust
test_shared_secret_computation_in_both_directions();
```

Takes no parameters.

### test_shared_secret_computation_from_address_in_both_directions

```rust
test_shared_secret_computation_from_address_in_both_directions();
```

Takes no parameters.

