# NullifierKeys

Nullifier keys pertaining to a specific account

## Fields
| Field | Type |
| --- | --- |
| account | AztecAddress |
| master_nullifier_public_key | GrumpkinPoint |
| app_nullifier_secret_key | Field |

## Standalone Functions

### get_nullifier_keys_oracle

```rust
get_nullifier_keys_oracle(_account);
```

#### Parameters
| Name | Type |
| --- | --- |
| _account | AztecAddress |

### get_nullifier_keys_internal

```rust
get_nullifier_keys_internal(account);
```

#### Parameters
| Name | Type |
| --- | --- |
| account | AztecAddress |

### get_nullifier_keys

```rust
get_nullifier_keys(account);
```

#### Parameters
| Name | Type |
| --- | --- |
| account | AztecAddress |

### get_app_nullifier_secret_key

```rust
get_app_nullifier_secret_key(account);
```

#### Parameters
| Name | Type |
| --- | --- |
| account | AztecAddress |

