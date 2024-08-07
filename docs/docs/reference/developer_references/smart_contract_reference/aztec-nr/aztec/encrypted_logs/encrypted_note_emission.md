## Standalone Functions

### compute_unconstrained

```rust
compute_unconstrained(contract_address, storage_slot, ovsk_app, ovpk, ivpk, recipient, note);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| storage_slot | Field |
| ovsk_app | Field |
| ovpk | Point |
| ivpk | Point |
| recipient | AztecAddress |
| note | Note |

### compute

```rust
compute(contract_address, storage_slot, ovsk_app, ovpk, ivpk, recipient, note);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| storage_slot | Field |
| ovsk_app | Field |
| ovpk | Point |
| ivpk | Point |
| recipient | AztecAddress |
| note | Note |

### emit_with_keys

```rust
emit_with_keys(context, note, ovpk, ivpk, recipient, inner_compute, Field, Field, Point, Point, AztecAddress, Note);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| note | Note |
| ovpk | Point |
| ivpk | Point |
| recipient | AztecAddress |
| inner_compute | fn(AztecAddress |
| Field |  |
| Field |  |
| Point |  |
| Point |  |
| AztecAddress |  |
| Note |  |

### encode_and_encrypt_note

```rust
encode_and_encrypt_note(context, ov, iv);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| ov | AztecAddress |
| iv | AztecAddress |

### encode_and_encrypt_note_unconstrained

```rust
encode_and_encrypt_note_unconstrained(context, ov, iv);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| ov | AztecAddress |
| iv | AztecAddress |

### encode_and_encrypt_note_with_keys

```rust
encode_and_encrypt_note_with_keys(context, ovpk, ivpk, recipient);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| ovpk | Point |
| ivpk | Point |
| recipient | AztecAddress |

### encode_and_encrypt_note_with_keys_unconstrained

```rust
encode_and_encrypt_note_with_keys_unconstrained(context, ovpk, ivpk, recipient);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| ovpk | Point |
| ivpk | Point |
| recipient | AztecAddress |

