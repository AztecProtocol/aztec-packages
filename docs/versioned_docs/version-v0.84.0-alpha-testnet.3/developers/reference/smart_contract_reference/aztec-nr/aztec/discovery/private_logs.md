## Standalone Functions

### fetch_and_process_private_tagged_logs

```rust
fetch_and_process_private_tagged_logs(contract_address, compute_note_hash_and_nullifier, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| compute_note_hash_and_nullifier | ComputeNoteHashAndNullifier&lt;Env&gt; |
|  |  |

### process_log

```rust
process_log(contract_address, compute_note_hash_and_nullifier, pending_tagged_log, );
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| compute_note_hash_and_nullifier | ComputeNoteHashAndNullifier&lt;Env&gt; |
| pending_tagged_log | PendingTaggedLog |
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

