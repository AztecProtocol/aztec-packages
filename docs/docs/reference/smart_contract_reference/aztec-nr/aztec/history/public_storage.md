## Standalone Functions

### _public_storage_historical_read

```rust
_public_storage_historical_read(storage_slot, contract_address, header);
```

#### Parameters
| Name | Type |
| --- | --- |
| storage_slot | Field |
| contract_address | AztecAddress |
| header | Header |

### public_storage_historical_read

```rust
public_storage_historical_read(context, storage_slot, // The storage slot to read
    contract_address);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | PrivateContext |
| storage_slot | Field |
| // The storage slot to read
    contract_address | AztecAddress // The contract we want to look into |

### public_storage_historical_read_at

```rust
public_storage_historical_read_at(context, storage_slot, // The storage slot to read
    contract_address, // The contract we want to look into
    block_number);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | PrivateContext |
| storage_slot | Field |
| // The storage slot to read
    contract_address | AztecAddress |
| // The contract we want to look into
    block_number | u32 // The block number at the end of which we'll read the value |

