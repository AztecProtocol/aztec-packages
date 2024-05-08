## Standalone Functions

### get_npk_m

```rust
get_npk_m(context, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| address | AztecAddress |

### get_ivpk_m

```rust
get_ivpk_m(context, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| address | AztecAddress |

### get_ovpk_m

```rust
get_ovpk_m(context, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| address | AztecAddress |

### get_tpk_m

```rust
get_tpk_m(context, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| address | AztecAddress |

### get_master_key

```rust
get_master_key(context, address, key_index);
```

}

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| address | AztecAddress |
| key_index | Field |

### fetch_key_from_registry

```rust
fetch_key_from_registry(context, key_index, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| key_index | Field |
| address | AztecAddress |

### fetch_and_constrain_keys

```rust
fetch_and_constrain_keys(address);
```

Passes only when keys were not rotated - is expected to be called only when keys were not registered yet

#### Parameters
| Name | Type |
| --- | --- |
| address | AztecAddress |

