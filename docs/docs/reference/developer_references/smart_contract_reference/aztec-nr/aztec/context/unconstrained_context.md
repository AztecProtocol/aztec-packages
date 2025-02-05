# UnconstrainedContext

## Fields
| Field | Type |
| --- | --- |
| block_number | u32 |
| contract_address | AztecAddress |
| version | Field |
| chain_id | Field |

## Methods

### new

```rust
UnconstrainedContext::new();
```

Takes no parameters.

### at

```rust
UnconstrainedContext::at(contract_address);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |

### at_historical

```rust
UnconstrainedContext::at_historical(contract_address, block_number);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| block_number | u32 |

### block_number

```rust
UnconstrainedContext::block_number(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### this_address

```rust
UnconstrainedContext::this_address(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### version

```rust
UnconstrainedContext::version(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### chain_id

```rust
UnconstrainedContext::chain_id(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### raw_storage_read

```rust
UnconstrainedContext::raw_storage_read(self, storage_slot, );
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |
| storage_slot | Field |
|  |  |

### storage_read

```rust
UnconstrainedContext::storage_read(self, storage_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| storage_slot | Field |

