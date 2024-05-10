## Standalone Functions

### assert_current_call_valid_authwit

```rust
assert_current_call_valid_authwit(context, on_behalf_of);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| on_behalf_of | AztecAddress |

### assert_current_call_valid_authwit_public

```rust
assert_current_call_valid_authwit_public(context, on_behalf_of);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut TPublicContext |
| on_behalf_of | AztecAddress |

### compute_call_authwit_hash

```rust
compute_call_authwit_hash(caller, consumer, chain_id, version, selector, args);
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

### compute_inner_authwit_hash

```rust
compute_inner_authwit_hash(args);
```

#### Parameters
| Name | Type |
| --- | --- |
| args | [Field; N] |

### compute_outer_authwit_hash

```rust
compute_outer_authwit_hash(consumer, chain_id, version, inner_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| consumer | AztecAddress |
| chain_id | Field |
| version | Field |
| inner_hash | Field |

