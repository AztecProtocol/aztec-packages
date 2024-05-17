## Standalone Functions

### prove_note_validity

```rust
prove_note_validity(note, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |
| context | &mut PrivateContext |

### prove_note_validity_at

```rust
prove_note_validity_at(note, block_number, context);
```

A helper function that proves that a note is valid at the given block number

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |
| block_number | u32 |
| context | &mut PrivateContext |

