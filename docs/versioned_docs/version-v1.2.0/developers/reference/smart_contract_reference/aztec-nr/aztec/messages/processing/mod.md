## Standalone Functions

### get_private_logs

```rust
get_private_logs(contract_address, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
|  |  |

### enqueue_note_for_validation

```rust
enqueue_note_for_validation(contract_address, storage_slot, note_nonce, packed_note, MAX_NOTE_PACKED_LEN>, note_hash, nullifier, tx_hash, recipient, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| storage_slot | Field |
| note_nonce | Field |
| packed_note | BoundedVec&lt;Field |
| MAX_NOTE_PACKED_LEN&gt; |  |
| note_hash | Field |
| nullifier | Field |
| tx_hash | Field |
| recipient | AztecAddress |
|  |  |

### enqueue_event_for_validation

```rust
enqueue_event_for_validation(contract_address, event_type_id, serialized_event, MAX_EVENT_SERIALIZED_LEN>, event_commitment, tx_hash, recipient, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| event_type_id | EventSelector |
| serialized_event | BoundedVec&lt;Field |
| MAX_EVENT_SERIALIZED_LEN&gt; |  |
| event_commitment | Field |
| tx_hash | Field |
| recipient | AztecAddress |
|  |  |

### validate_enqueued_notes_and_events

```rust
validate_enqueued_notes_and_events(contract_address);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |

### get_pending_partial_notes_completion_logs

```rust
get_pending_partial_notes_completion_logs(contract_address, pending_partial_notes, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| pending_partial_notes | CapsuleArray&lt;DeliveredPendingPartialNote&gt; |
|  |  |

