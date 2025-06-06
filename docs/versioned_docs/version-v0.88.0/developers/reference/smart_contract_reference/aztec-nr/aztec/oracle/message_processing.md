## Standalone Functions

### fetch_tagged_logs

```rust
fetch_tagged_logs(pending_tagged_log_array_base_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| pending_tagged_log_array_base_slot | Field |

### fetch_tagged_logs_oracle

```rust
fetch_tagged_logs_oracle(pending_tagged_log_array_base_slot);
```

#### Parameters
| Name | Type |
| --- | --- |
| pending_tagged_log_array_base_slot | Field |

### update_max_len

```rust
update_max_len(self);
```

/ If the log's content exceeds TO_LEN

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### get_public_log_by_tag

```rust
get_public_log_by_tag(tag, contract_address, );
```

#### Parameters
| Name | Type |
| --- | --- |
| tag | Field |
| contract_address | AztecAddress |
|  |  |

### get_public_log_by_tag_oracle

```rust
get_public_log_by_tag_oracle(tag, contract_address, );
```

#### Parameters
| Name | Type |
| --- | --- |
| tag | Field |
| contract_address | AztecAddress |
|  |  |

### get_private_log_by_tag

```rust
get_private_log_by_tag(tag, contract_address, );
```

#### Parameters
| Name | Type |
| --- | --- |
| tag | Field |
| contract_address | AztecAddress |
|  |  |

### get_private_log_by_tag_oracle

```rust
get_private_log_by_tag_oracle(siloed_tag, );
```

#### Parameters
| Name | Type |
| --- | --- |
| siloed_tag | Field |
|  |  |

### get_log_by_tag

```rust
get_log_by_tag(tag, contract_address, );
```

#### Parameters
| Name | Type |
| --- | --- |
| tag | Field |
| contract_address | AztecAddress |
|  |  |

### validate_enqueued_notes_and_events

```rust
validate_enqueued_notes_and_events(contract_address, note_validation_requests_array_base_slot, event_validation_requests_array_base_slot, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| note_validation_requests_array_base_slot | Field |
| event_validation_requests_array_base_slot | Field |
|  |  |

### validate_enqueued_notes_and_events_oracle

```rust
validate_enqueued_notes_and_events_oracle(contract_address, note_validation_requests_array_base_slot, event_validation_requests_array_base_slot, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| note_validation_requests_array_base_slot | Field |
| event_validation_requests_array_base_slot | Field |
|  |  |

