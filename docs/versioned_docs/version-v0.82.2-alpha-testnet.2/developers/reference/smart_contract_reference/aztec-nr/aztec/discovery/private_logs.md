## Standalone Functions

### fetch_and_process_private_tagged_logs

```rust
fetch_and_process_private_tagged_logs(_contract_address, _compute_note_hash_and_nullifier, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _contract_address | AztecAddress |
| _compute_note_hash_and_nullifier | ComputeNoteHashAndNullifier&lt;Env&gt; |
|  |  |

### do_process_log

```rust
do_process_log(contract_address, log, PRIVATE_LOG_SIZE_IN_FIELDS>, tx_hash, unique_note_hashes_in_tx, MAX_NOTE_HASHES_PER_TX>, first_nullifier_in_tx, recipient, compute_note_hash_and_nullifier, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| log | BoundedVec&lt;Field |
| PRIVATE_LOG_SIZE_IN_FIELDS&gt; |  |
| tx_hash | Field |
| unique_note_hashes_in_tx | BoundedVec&lt;Field |
| MAX_NOTE_HASHES_PER_TX&gt; |  |
| first_nullifier_in_tx | Field |
| recipient | AztecAddress |
| compute_note_hash_and_nullifier | ComputeNoteHashAndNullifier&lt;Env&gt; |
|  |  |

### decode_log_plaintext

```rust
decode_log_plaintext(log_plaintext, PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| log_plaintext | BoundedVec&lt;Field |
| PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS&gt; |  |
|  |  |

