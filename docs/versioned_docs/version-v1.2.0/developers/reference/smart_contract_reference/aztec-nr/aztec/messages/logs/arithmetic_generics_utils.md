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
get_arr_of_size__log_bytes_without_padding(_ct, );
```

Let lbwop = 1 + HEADER_CIPHERTEXT_SIZE_IN_BYTES + |ct| // aka log bytes without padding

#### Parameters
| Name | Type |
| --- | --- |
| _ct | [u8; CT] |
|  |  |

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

