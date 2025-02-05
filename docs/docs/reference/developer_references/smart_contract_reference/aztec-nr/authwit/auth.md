## Standalone Functions

### assert_current_call_valid_authwit

```rust
assert_current_call_valid_authwit(context, on_behalf_of);
```

docs:start:assert_current_call_valid_authwit

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| on_behalf_of | AztecAddress |

### assert_inner_hash_valid_authwit

```rust
assert_inner_hash_valid_authwit(context, on_behalf_of, inner_hash, );
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| on_behalf_of | AztecAddress |
| inner_hash | Field |
|  |  |

### assert_current_call_valid_authwit_public

```rust
assert_current_call_valid_authwit_public(context, on_behalf_of, );
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PublicContext |
| on_behalf_of | AztecAddress |
|  |  |

### assert_inner_hash_valid_authwit_public

```rust
assert_inner_hash_valid_authwit_public(context, on_behalf_of, inner_hash, );
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PublicContext |
| on_behalf_of | AztecAddress |
| inner_hash | Field |
|  |  |

### compute_authwit_message_hash_from_call

```rust
compute_authwit_message_hash_from_call(caller, consumer, chain_id, version, selector, args, );
```

#### Parameters
| Name | Type |
| --- | --- |
| caller | AztecAddress |
| consumer | AztecAddress |
| chain_id | Field |
| version | Field |
| selector | FunctionSelector |
| args | [Field; N] |
|  |  |

### compute_inner_authwit_hash

```rust
compute_inner_authwit_hash(args);
```

#### Parameters
| Name | Type |
| --- | --- |
| args | [Field; N] |

### compute_authwit_nullifier

```rust
compute_authwit_nullifier(on_behalf_of, inner_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| on_behalf_of | AztecAddress |
| inner_hash | Field |

### compute_authwit_message_hash

```rust
compute_authwit_message_hash(consumer, chain_id, version, inner_hash, );
```

#### Parameters
| Name | Type |
| --- | --- |
| consumer | AztecAddress |
| chain_id | Field |
| version | Field |
| inner_hash | Field |
|  |  |

### set_authorized

```rust
set_authorized(context, message_hash, authorize, );
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PublicContext |
| message_hash | Field |
| authorize | bool |
|  |  |

### set_reject_all

```rust
set_reject_all(context, reject);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PublicContext |
| reject | bool |

