## Standalone Functions

### store

```rust
store(contract_address, slot, value);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| slot | Field |
| value | T |

### load

```rust
load(contract_address, slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| slot | Field |

### delete

```rust
delete(contract_address, slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| slot | Field |

### copy

```rust
copy(contract_address, src_slot, dst_slot, num_entries, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| src_slot | Field |
| dst_slot | Field |
| num_entries | u32 |
|  |  |

### store_oracle

```rust
store_oracle(contract_address, slot, values, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| slot | Field |
| values | [Field; N] |
|  |  |

### load_oracle

```rust
load_oracle(contract_address, slot, array_len, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| slot | Field |
| array_len | u32 |
|  |  |

### delete_oracle

```rust
delete_oracle(contract_address, slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| slot | Field |

### copy_oracle

```rust
copy_oracle(contract_address, src_slot, dst_slot, num_entries, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| src_slot | Field |
| dst_slot | Field |
| num_entries | u32 |
|  |  |

### setup

```rust
setup();
```

Takes no parameters.

### stores_and_loads

```rust
stores_and_loads();
```

Takes no parameters.

### store_overwrites

```rust
store_overwrites();
```

Takes no parameters.

### loads_empty_slot

```rust
loads_empty_slot();
```

Takes no parameters.

### deletes_stored_value

```rust
deletes_stored_value();
```

Takes no parameters.

### deletes_empty_slot

```rust
deletes_empty_slot();
```

Takes no parameters.

### copies_non_overlapping_values

```rust
copies_non_overlapping_values();
```

Takes no parameters.

### copies_overlapping_values_with_src_ahead

```rust
copies_overlapping_values_with_src_ahead();
```

Takes no parameters.

### copies_overlapping_values_with_dst_ahead

```rust
copies_overlapping_values_with_dst_ahead();
```

Takes no parameters.

### cannot_copy_empty_values

```rust
cannot_copy_empty_values();
```

Takes no parameters.

### cannot_store_other_contract

```rust
cannot_store_other_contract();
```

Takes no parameters.

### cannot_load_other_contract

```rust
cannot_load_other_contract();
```

Takes no parameters.

### cannot_delete_other_contract

```rust
cannot_delete_other_contract();
```

Takes no parameters.

### cannot_copy_other_contract

```rust
cannot_copy_other_contract();
```

Takes no parameters.

