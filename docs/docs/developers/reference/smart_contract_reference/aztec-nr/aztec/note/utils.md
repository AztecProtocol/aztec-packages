## Standalone Functions

### compute_siloed_nullifier

```rust
compute_siloed_nullifier(note_with_header, context, );
```

#### Parameters
| Name | Type |
| --- | --- |
| note_with_header | Note |
| context | &mut PrivateContext |
|  |  |

### compute_note_hash_for_read_request

```rust
compute_note_hash_for_read_request(note);
```

TODO(#7775): make this not impossible to understand

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |

### compute_note_hash_for_nullify_internal

```rust
compute_note_hash_for_nullify_internal(note, note_hash_for_read_request, );
```

TODO(#7775): make this not impossible to understand

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |
| note_hash_for_read_request | Field |
|  |  |

### compute_note_hash_for_nullify

```rust
compute_note_hash_for_nullify(note);
```

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |

### compute_note_hash_for_nullify

```rust
compute_note_hash_for_nullify(note);
```

}

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |

### compute_note_hash_and_optionally_a_nullifier

```rust
compute_note_hash_and_optionally_a_nullifier(deserialize_content);
```

#### Parameters
| Name | Type |
| --- | --- |
| deserialize_content | fn([Field; N] |

