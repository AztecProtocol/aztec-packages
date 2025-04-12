## Standalone Functions

### notify_created_contract_class_log

```rust
notify_created_contract_class_log(contract_address, message, counter, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| message | [Field; N] |
| counter | u32 |
|  |  |

### notify_created_contract_class_log_private_oracle

```rust
notify_created_contract_class_log_private_oracle(contract_address, message, counter, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| message | [Field; N] |
| counter | u32 |
|  |  |

### store_private_event_log

```rust
store_private_event_log(contract_address, recipient, event_selector, log_content, MAX_LOG_CONTENT_LEN>, tx_hash, log_index_in_tx, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| recipient | AztecAddress |
| event_selector | EventSelector |
| log_content | BoundedVec&lt;Field |
| MAX_LOG_CONTENT_LEN&gt; |  |
| tx_hash | Field |
| log_index_in_tx | Field |
|  |  |

### store_private_event_log_oracle

```rust
store_private_event_log_oracle(contract_address, recipient, event_selector, log_content, MAX_LOG_CONTENT_LEN>, tx_hash, log_index_in_tx, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| recipient | AztecAddress |
| event_selector | EventSelector |
| log_content | BoundedVec&lt;Field |
| MAX_LOG_CONTENT_LEN&gt; |  |
| tx_hash | Field |
| log_index_in_tx | Field |
|  |  |

