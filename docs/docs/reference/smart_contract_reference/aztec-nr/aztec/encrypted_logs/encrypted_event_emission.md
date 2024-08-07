## Standalone Functions

### compute_unconstrained

```rust
compute_unconstrained(contract_address, randomness, ovsk_app, ovpk, ivpk, recipient, event);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| randomness | Field |
| ovsk_app | Field |
| ovpk | Point |
| ivpk | Point |
| recipient | AztecAddress |
| event | Event |

### compute

```rust
compute(contract_address, randomness, ovsk_app, ovpk, ivpk, recipient, event);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| randomness | Field |
| ovsk_app | Field |
| ovpk | Point |
| ivpk | Point |
| recipient | AztecAddress |
| event | Event |

### emit_with_keys

```rust
emit_with_keys(context, randomness, event, ovpk, ivpk, iv, inner_compute, Field, Field, Point, Point, AztecAddress, Event);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| randomness | Field |
| event | Event |
| ovpk | Point |
| ivpk | Point |
| iv | AztecAddress |
| inner_compute | fn(AztecAddress |
| Field |  |
| Field |  |
| Point |  |
| Point |  |
| AztecAddress |  |
| Event |  |

### encode_and_encrypt_event

```rust
encode_and_encrypt_event(context, ov, iv);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| ov | AztecAddress |
| iv | AztecAddress |

### encode_and_encrypt_event_unconstrained

```rust
encode_and_encrypt_event_unconstrained(context, ov, iv);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| ov | AztecAddress |
| iv | AztecAddress |

### encode_and_encrypt_event_with_randomness

```rust
encode_and_encrypt_event_with_randomness(context, randomness, ov, iv);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| randomness | Field |
| ov | AztecAddress |
| iv | AztecAddress |

### encode_and_encrypt_event_with_randomness_unconstrained

```rust
encode_and_encrypt_event_with_randomness_unconstrained(context, randomness, ov, iv);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| randomness | Field |
| ov | AztecAddress |
| iv | AztecAddress |

### encode_and_encrypt_event_with_keys

```rust
encode_and_encrypt_event_with_keys(context, ovpk, ivpk, recipient);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| ovpk | Point |
| ivpk | Point |
| recipient | AztecAddress |

### encode_and_encrypt_event_with_keys_unconstrained

```rust
encode_and_encrypt_event_with_keys_unconstrained(context, ovpk, ivpk, recipient);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| ovpk | Point |
| ivpk | Point |
| recipient | AztecAddress |

### encode_and_encrypt_event_with_keys_with_randomness

```rust
encode_and_encrypt_event_with_keys_with_randomness(context, randomness, ovpk, ivpk, recipient);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| randomness | Field |
| ovpk | Point |
| ivpk | Point |
| recipient | AztecAddress |

### encode_and_encrypt_event_with_keys_with_randomness_unconstrained

```rust
encode_and_encrypt_event_with_keys_with_randomness_unconstrained(context, randomness, ovpk, ivpk, recipient);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| randomness | Field |
| ovpk | Point |
| ivpk | Point |
| recipient | AztecAddress |

