## Standalone Functions

### _nullifier_inclusion

```rust
_nullifier_inclusion(nullifier, header);
```

#### Parameters
| Name | Type |
| --- | --- |
| nullifier | Field |
| header | Header |

### prove_nullifier_inclusion

```rust
prove_nullifier_inclusion(nullifier, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| nullifier | Field |
| context | PrivateContext |

### prove_nullifier_inclusion_at

```rust
prove_nullifier_inclusion_at(nullifier, block_number, // The block at which we'll prove that the nullifier exists in the nullifier tree
    context);
```

#### Parameters
| Name | Type |
| --- | --- |
| nullifier | Field |
| block_number | u32 |
| // The block at which we'll prove that the nullifier exists in the nullifier tree
    context | PrivateContext |

### prove_note_is_nullified

```rust
prove_note_is_nullified(note, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |
| context | &mut PrivateContext |

### prove_note_is_nullified_at

```rust
prove_note_is_nullified_at(note, block_number, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |
| block_number | u32 |
| context | &mut PrivateContext |

