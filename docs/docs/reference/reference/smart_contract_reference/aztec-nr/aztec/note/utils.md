## Standalone Functions

### compute_siloed_hash

```rust
compute_siloed_hash(contract_address, unique_note_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| unique_note_hash | Field |

### compute_unique_hash

```rust
compute_unique_hash(nonce, inner_note_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| nonce | Field |
| inner_note_hash | Field |

### compute_inner_note_hash

```rust
compute_inner_note_hash(note);
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |

### compute_unique_note_hash

```rust
compute_unique_note_hash(note_with_header);
```

#### Parameters
| Name | Type |
| --- | --- |
| note_with_header | Note |

### compute_siloed_note_hash

```rust
compute_siloed_note_hash(note_with_header);
```

#### Parameters
| Name | Type |
| --- | --- |
| note_with_header | Note |

### compute_siloed_nullifier

```rust
compute_siloed_nullifier(note_with_header, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| note_with_header | Note |
| context | &mut PrivateContext |

### compute_note_hash_for_insertion

```rust
compute_note_hash_for_insertion(note);
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |

### compute_note_hash_for_consumption

```rust
compute_note_hash_for_consumption(note);
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |

### compute_note_hash_and_nullifier

```rust
compute_note_hash_and_nullifier(// docs);
```

#### Parameters
| Name | Type |
| --- | --- |
| // docs | start |

