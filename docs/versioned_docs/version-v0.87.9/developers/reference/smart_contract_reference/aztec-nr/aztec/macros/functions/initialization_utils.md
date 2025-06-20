## Standalone Functions

### mark_as_initialized_public

```rust
mark_as_initialized_public(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PublicContext |

### mark_as_initialized_private

```rust
mark_as_initialized_private(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |

### assert_is_initialized_public

```rust
assert_is_initialized_public(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PublicContext |

### assert_is_initialized_private

```rust
assert_is_initialized_private(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |

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

### assert_initialization_matches_address_preimage_private

```rust
assert_initialization_matches_address_preimage_private(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | PrivateContext |

### compute_initialization_hash

```rust
compute_initialization_hash(init_selector, init_args_hash, );
```

/ initialized with the correct constructor arguments. Don't hide this unless you implement factory functionality.

#### Parameters
| Name | Type |
| --- | --- |
| init_selector | FunctionSelector |
| init_args_hash | Field |
|  |  |

