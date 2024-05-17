## Standalone Functions

### _nullifier_non_inclusion

```rust
_nullifier_non_inclusion(nullifier, header);
```

#### Parameters
| Name | Type |
| --- | --- |
| nullifier | Field |
| header | Header |

### prove_nullifier_not_included

```rust
prove_nullifier_not_included(nullifier, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| nullifier | Field |
| context | PrivateContext |

### prove_nullifier_not_included_at

```rust
prove_nullifier_not_included_at(nullifier, block_number, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| nullifier | Field |
| block_number | u32 |
| context | PrivateContext |

### prove_note_not_nullified

```rust
prove_note_not_nullified(note, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |
| context | &mut PrivateContext |

### prove_note_not_nullified_at

```rust
prove_note_not_nullified_at(note, block_number, // The block at which we'll prove that the note was not nullified
    context);
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |
| block_number | u32 |
| // The block at which we'll prove that the note was not nullified
    context | &mut PrivateContext |

