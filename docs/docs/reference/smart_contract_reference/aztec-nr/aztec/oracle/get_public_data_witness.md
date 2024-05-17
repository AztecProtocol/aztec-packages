# PublicDataWitness

## Fields
| Field | Type |
| --- | --- |
| index | Field |
| leaf_preimage | PublicDataTreeLeafPreimage |
| path | Field; PUBLIC_DATA_TREE_HEIGHT] |

## Standalone Functions

### get_public_data_witness_oracle

```rust
get_public_data_witness_oracle(_block_number, _leaf_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| _block_number | u32 |
| _leaf_slot | Field |

### get_public_data_witness

```rust
get_public_data_witness(block_number, leaf_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| block_number | u32 |
| leaf_slot | Field |

