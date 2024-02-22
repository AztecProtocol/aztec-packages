# L1ToL2Message

## Fields
| Field | Type |
| --- | --- |
| sender | EthAddress |
| chainId | Field |
| recipient | AztecAddress |
| version | Field |
| content | Field |
| secret | Field |
| secret_hash | Field |
| deadline | u32 |
| fee | u64 |
| tree_index | Field |

## Methods

### validate_message_secret

```rust
L1ToL2Message::validate_message_secret(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |

### hash

```rust
L1ToL2Message::hash(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |

#### Returns
| Type |
| --- |
| Field |

### compute_nullifier

```rust
L1ToL2Message::compute_nullifier(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |

#### Returns
| Type |
| --- |
| Field |

