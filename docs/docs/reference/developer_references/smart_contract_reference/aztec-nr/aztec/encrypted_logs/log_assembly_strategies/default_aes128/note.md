## Standalone Functions

### get_arr_of_size__full_plaintext

```rust
get_arr_of_size__full_plaintext();
```

|full_pt| = |pt| = (N * 32) + 64

Takes no parameters.

### get_arr_of_size__plaintext_aes_padding

```rust
get_arr_of_size__plaintext_aes_padding(_full_pt, );
```

|pt_aes_padding| = 16 - (|full_pt| % 16)

#### Parameters
| Name | Type |
| --- | --- |
| _full_pt | [u8; FULL_PT] |
|  |  |

### get_arr_of_size__ciphertext

```rust
get_arr_of_size__ciphertext(_full_pt, _pt_aes_padding, );
```

|ct| = |full_pt| + |pt_aes_padding|

#### Parameters
| Name | Type |
| --- | --- |
| _full_pt | [u8; FULL_PT] |
| _pt_aes_padding | [u8; PT_AES_PADDING] |
|  |  |

### get_arr_of_size__log_bytes_without_padding

```rust
get_arr_of_size__log_bytes_without_padding(_ct);
```

Let lbwop = 1 + 48 + |ct| // aka log bytes without padding

#### Parameters
| Name | Type |
| --- | --- |
| _ct | [u8; CT] |

### get_arr_of_size__log_bytes_padding

```rust
get_arr_of_size__log_bytes_padding(_lbwop, );
```

(because ceil(x / y) = (x + y - 1) // y ).

#### Parameters
| Name | Type |
| --- | --- |
| _lbwop | [u8; LBWOP] |
|  |  |

### get_arr_of_size__log_bytes

```rust
get_arr_of_size__log_bytes(_lbwop, _p, );
```

p is the padding

#### Parameters
| Name | Type |
| --- | --- |
| _lbwop | [u8; LBWOP] |
| _p | [u8; P] |
|  |  |

### get_arr_of_size__log_bytes_padding__from_PT

```rust
get_arr_of_size__log_bytes_padding__from_PT();
```

Takes no parameters.

### get_arr_of_size__log_bytes__from_PT

```rust
get_arr_of_size__log_bytes__from_PT();
```

Takes no parameters.

### assert_note_exists

```rust
assert_note_exists(context, note);
```

TODO: it feels like this existence check is in the wrong place. In fact, why is it needed at all? Under what circumstances have we found a non-existent note being emitted accidentally?

#### Parameters
| Name | Type |
| --- | --- |
| context | PrivateContext |
| note | Note |

### compute_note_plaintext_for_this_strategy

```rust
compute_note_plaintext_for_this_strategy(note);
```

/ NB: The extra `+ 64` bytes is for the note_id and the storage_slot of the note:

#### Parameters
| Name | Type |
| --- | --- |
| note | Note |

### compute_log

```rust
compute_log(context, note, recipient, sender, );
```

#### Parameters
| Name | Type |
| --- | --- |
| context | PrivateContext |
| note | Note |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

### compute_log_unconstrained

```rust
compute_log_unconstrained(context, note, recipient, sender, );
```

#### Parameters
| Name | Type |
| --- | --- |
| context | PrivateContext |
| note | Note |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

### encode_and_encrypt_note

```rust
encode_and_encrypt_note(context, recipient, // We need this because to compute a tagging secret, we require a sender, );
```

If you get weird behavior it might be because of it.

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| recipient | AztecAddress |
| // We need this because to compute a tagging secret |  |
| we require a sender | sender |
|  |  |

### encode_and_encrypt_note_unconstrained

```rust
encode_and_encrypt_note_unconstrained(context, recipient, // We need this because to compute a tagging secret, we require a sender, );
```

context.

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| recipient | AztecAddress |
| // We need this because to compute a tagging secret |  |
| we require a sender | sender |
|  |  |

### test_encrypted_log_matches_typescript

```rust
test_encrypted_log_matches_typescript();
```

Takes no parameters.

