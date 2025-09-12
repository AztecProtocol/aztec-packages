# UtilityContext

## Fields
| Field | Type |
| --- | --- |
| block_number | u32 |
| timestamp | u64 |
| contract_address | AztecAddress |
| version | Field |
| chain_id | Field |

## Methods

### new

```rust
UtilityContext::new();
```

Takes no parameters.

### at

```rust
UtilityContext::at(contract_address);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |

### at_historical

```rust
UtilityContext::at_historical(contract_address, block_number);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| block_number | u32 |

### block_number

```rust
UtilityContext::block_number(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### timestamp

```rust
UtilityContext::timestamp(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### this_address

```rust
UtilityContext::this_address(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### version

```rust
UtilityContext::version(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### chain_id

```rust
UtilityContext::chain_id(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### raw_storage_read

```rust
UtilityContext::raw_storage_read(self, storage_slot, );
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |
| storage_slot | Field |
|  |  |

### storage_read

```rust
UtilityContext::storage_read(self, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| storage_slot | Field |

