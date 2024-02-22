## Standalone Functions

### compute_siloed_hash

```rust
compute_siloed_hash(contract_address, inner_note_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| inner_note_hash | Field |

#### Returns
| Type |
| --- |
| Field |

### compute_unique_hash

```rust
compute_unique_hash(nonce, siloed_note_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| nonce | Field |
| siloed_note_hash | Field |

#### Returns
| Type |
| --- |
| Field |

### compute_inner_note_hash

```rust
compute_inner_note_hash(note);
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |

#### Returns
| Type |
| --- |
| Field where Note: NoteInterface&lt;N&gt; |

### compute_siloed_note_hash

```rust
compute_siloed_note_hash(note_with_header);
```

#### Parameters
| Name | Type |
| --- | --- |
| note_with_header | Note |

#### Returns
| Type |
| --- |
| Field where Note: NoteInterface&lt;N&gt; |

### compute_unique_siloed_note_hash

```rust
compute_unique_siloed_note_hash(note_with_header);
```

#### Parameters
| Name | Type |
| --- | --- |
| note_with_header | Note |

#### Returns
| Type |
| --- |
| Field where Note: NoteInterface&lt;N&gt; |

### compute_note_hash_for_insertion

```rust
compute_note_hash_for_insertion(note);
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |

#### Returns
| Type |
| --- |
| Field where Note: NoteInterface&lt;N&gt; |

### compute_note_hash_for_consumption

```rust
compute_note_hash_for_consumption(note);
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |

#### Returns
| Type |
| --- |
| Field where Note: NoteInterface&lt;N&gt; |

