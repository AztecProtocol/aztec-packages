# LogWithTxData

/ The contents of a public log, plus contextual information about the transaction in which the log was emitted. This / is the data required in order to discover notes that are being delivered in a log. TODO(#11639): this could also be used to fetch private logs, but the `BoundedVec` maximum length is that of a public log.

## Fields
| Field | Type |
| --- | --- |
| pub log_content | BoundedVec&lt;Field, PUBLIC_LOG_SIZE_IN_FIELDS + 1&gt; |
| pub tx_hash | Field |
| pub unique_note_hashes_in_tx | BoundedVec&lt;Field, MAX_NOTE_HASHES_PER_TX&gt; |
| pub first_nullifier_in_tx | Field |

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

### deliver_note

```rust
deliver_note(contract_address, storage_slot, nonce, packed_note, MAX_NOTE_PACKED_LEN>, note_hash, nullifier, tx_hash, recipient, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| storage_slot | Field |
| nonce | Field |
| packed_note | BoundedVec&lt;Field |
| MAX_NOTE_PACKED_LEN&gt; |  |
| note_hash | Field |
| nullifier | Field |
| tx_hash | Field |
| recipient | AztecAddress |
|  |  |

### get_log_by_tag

```rust
get_log_by_tag(tag);
```

#### Parameters
| Name | Type |
| --- | --- |
| tag | Field |

### deliver_note_oracle

```rust
deliver_note_oracle(contract_address, storage_slot, nonce, packed_note, MAX_NOTE_PACKED_LEN>, note_hash, nullifier, tx_hash, recipient, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| storage_slot | Field |
| nonce | Field |
| packed_note | BoundedVec&lt;Field |
| MAX_NOTE_PACKED_LEN&gt; |  |
| note_hash | Field |
| nullifier | Field |
| tx_hash | Field |
| recipient | AztecAddress |
|  |  |

### get_log_by_tag_oracle

```rust
get_log_by_tag_oracle(tag);
```

#### Parameters
| Name | Type |
| --- | --- |
| tag | Field |

