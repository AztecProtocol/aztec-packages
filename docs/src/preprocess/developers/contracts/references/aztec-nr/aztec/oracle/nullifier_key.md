# NullifierKeyPair

## Fields
| Field | Type |
| --- | --- |
| account | AztecAddress |
| public_key | GrumpkinPoint |
| secret_key | GrumpkinPrivateKey |

## Standalone Functions

### get_nullifier_key_pair_oracle

```rust
get_nullifier_key_pair_oracle(_account);
```

#### Parameters
| Name | Type |
| --- | --- |
| _account | AztecAddress |

#### Returns
| Type |
| --- |
| Field; 4] |

### get_nullifier_key_pair_internal

```rust
get_nullifier_key_pair_internal(account);
```

#### Parameters
| Name | Type |
| --- | --- |
| account | AztecAddress |

#### Returns
| Type |
| --- |
| NullifierKeyPair |

### get_nullifier_key_pair

```rust
get_nullifier_key_pair(account);
```

#### Parameters
| Name | Type |
| --- | --- |
| account | AztecAddress |

#### Returns
| Type |
| --- |
| NullifierKeyPair |

### get_nullifier_secret_key

```rust
get_nullifier_secret_key(account);
```

#### Parameters
| Name | Type |
| --- | --- |
| account | AztecAddress |

#### Returns
| Type |
| --- |
| GrumpkinPrivateKey |

