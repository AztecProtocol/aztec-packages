## Standalone Functions

### _note_inclusion

```rust
_note_inclusion(note, header);
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |
| header | Header |

### prove_note_inclusion

```rust
prove_note_inclusion(note, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |
| context | PrivateContext |

### prove_note_inclusion_at

```rust
prove_note_inclusion_at(note, block_number, // The block at which we'll prove that the note exists
    context);
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |
| block_number | u32 |
| // The block at which we'll prove that the note exists
    context | PrivateContext |

