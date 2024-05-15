## Standalone Functions

### mark_as_initialized_public

```rust
mark_as_initialized_public(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PublicContext |

### mark_as_initialized_avm

```rust
mark_as_initialized_avm(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut AvmContext |

### mark_as_initialized_private

```rust
mark_as_initialized_private(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |

### mark_as_initialized

```rust
mark_as_initialized(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut TContext |

### assert_is_initialized_public

```rust
assert_is_initialized_public(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PublicContext |

### assert_is_initialized_avm

```rust
assert_is_initialized_avm(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut AvmContext |

### assert_is_initialized_private

```rust
assert_is_initialized_private(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |

### compute_contract_initialization_nullifier

```rust
compute_contract_initialization_nullifier(address);
```

#### Parameters
| Name | Type |
| --- | --- |
| address | AztecAddress |

### compute_unsiloed_contract_initialization_nullifier

```rust
compute_unsiloed_contract_initialization_nullifier(address);
```

#### Parameters
| Name | Type |
| --- | --- |
| address | AztecAddress |

### assert_initialization_matches_address_preimage_public

```rust
assert_initialization_matches_address_preimage_public(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | PublicContext |

### assert_initialization_matches_address_preimage_avm

```rust
assert_initialization_matches_address_preimage_avm(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | AvmContext |

### assert_initialization_matches_address_preimage_private

```rust
assert_initialization_matches_address_preimage_private(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | PrivateContext |

### assert_initialization_matches_address_preimage

```rust
assert_initialization_matches_address_preimage(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | TContext |

### compute_initialization_hash

```rust
compute_initialization_hash(init_selector, init_args_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| init_selector | FunctionSelector |
| init_args_hash | Field |

