## Standalone Functions

### compute_event_plaintext_for_this_strategy

```rust
compute_event_plaintext_for_this_strategy(event);
```

/ NB: The extra `+ 1` is for the event_type_id:

#### Parameters
| Name | Type |
| --- | --- |
| event | Event |

### compute_log

```rust
compute_log(context, event, recipient, _sender, );
```

we perform some note-specific log length assertions.

#### Parameters
| Name | Type |
| --- | --- |
| context | PrivateContext |
| event | Event |
| recipient | AztecAddress |
| _sender | AztecAddress |
|  |  |

### compute_log_unconstrained

```rust
compute_log_unconstrained(context, event, recipient, sender, );
```

#### Parameters
| Name | Type |
| --- | --- |
| context | PrivateContext |
| event | Event |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

### encode_and_encrypt_event

```rust
encode_and_encrypt_event(context, recipient, sender, );
```

/ private logs.

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

### encode_and_encrypt_event_unconstrained

```rust
encode_and_encrypt_event_unconstrained(context, recipient, sender, );
```

/// Only use this function in scenarios where the recipient not receiving the event is an acceptable outcome.

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| recipient | AztecAddress |
| sender | AztecAddress |
|  |  |

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

