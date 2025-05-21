# NullifierMembershipWitness

## Fields
| Field | Type |
| --- | --- |
| pub index | Field |
| pub leaf_preimage | NullifierLeafPreimage |
| pub path | Field; NULLIFIER_TREE_HEIGHT] |

## Methods

### deserialize

```rust
NullifierMembershipWitness::deserialize(fields);
```

#### Parameters
| Name | Type |
| --- | --- |
| fields | [Field; NULLIFIER_MEMBERSHIP_WITNESS] |

## Standalone Functions

### get_low_nullifier_membership_witness_oracle

```rust
get_low_nullifier_membership_witness_oracle(_block_number, _nullifier, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _block_number | u32 |
| _nullifier | Field |
|  |  |

### get_low_nullifier_membership_witness

```rust
get_low_nullifier_membership_witness(block_number, nullifier, );
```

#### Parameters
| Name | Type |
| --- | --- |
| block_number | u32 |
| nullifier | Field |
|  |  |

### get_nullifier_membership_witness_oracle

```rust
get_nullifier_membership_witness_oracle(_block_number, _nullifier, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _block_number | u32 |
| _nullifier | Field |
|  |  |

### get_nullifier_membership_witness

```rust
get_nullifier_membership_witness(block_number, nullifier, );
```

#### Parameters
| Name | Type |
| --- | --- |
| block_number | u32 |
| nullifier | Field |
|  |  |

