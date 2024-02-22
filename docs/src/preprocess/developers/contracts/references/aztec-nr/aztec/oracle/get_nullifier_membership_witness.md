# NullifierMembershipWitness

## Fields
| Field | Type |
| --- | --- |
| index | Field |
| leaf_preimage | NullifierLeafPreimage |
| path | Field; NULLIFIER_TREE_HEIGHT] |

## Methods

### deserialize

```rust
NullifierMembershipWitness::deserialize(fields);
```

#### Parameters
| Name | Type |
| --- | --- |
| fields | [Field; NULLIFIER_MEMBERSHIP_WITNESS] |

#### Returns
| Type |
| --- |
| Self |

## Standalone Functions

### get_low_nullifier_membership_witness

```rust
get_low_nullifier_membership_witness(block_number, nullifier);
```

#### Parameters
| Name | Type |
| --- | --- |
| block_number | u32 |
| nullifier | Field |

#### Returns
| Type |
| --- |
| NullifierMembershipWitness |

### get_nullifier_membership_witness

```rust
get_nullifier_membership_witness(block_number, nullifier);
```

#### Parameters
| Name | Type |
| --- | --- |
| block_number | u32 |
| nullifier | Field |

#### Returns
| Type |
| --- |
| NullifierMembershipWitness |

