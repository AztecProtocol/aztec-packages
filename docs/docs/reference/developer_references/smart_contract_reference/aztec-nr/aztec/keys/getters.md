## Standalone Functions

### get_npk_m

```rust
get_npk_m(header, context, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| header | Header |
| context | &mut PrivateContext |
| address | AztecAddress |

### get_ivpk_m

```rust
get_ivpk_m(header, context, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| header | Header |
| context | &mut PrivateContext |
| address | AztecAddress |

### get_ovpk_m

```rust
get_ovpk_m(header, context, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| header | Header |
| context | &mut PrivateContext |
| address | AztecAddress |

### get_tpk_m

```rust
get_tpk_m(header, context, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| header | Header |
| context | &mut PrivateContext |
| address | AztecAddress |

### get_npk_m_hash

```rust
get_npk_m_hash(header, context, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| header | Header |
| context | &mut PrivateContext |
| address | AztecAddress |

### get_npk_m

```rust
get_npk_m(self, context, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |
| address | AztecAddress |

### get_ivpk_m

```rust
get_ivpk_m(self, context, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |
| address | AztecAddress |

### get_ovpk_m

```rust
get_ovpk_m(self, context, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |
| address | AztecAddress |

### get_tpk_m

```rust
get_tpk_m(self, context, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |
| address | AztecAddress |

### get_npk_m_hash

```rust
get_npk_m_hash(self, context, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |
| address | AztecAddress |

### get_master_key

```rust
get_master_key(context, address, key_index, header);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| address | AztecAddress |
| key_index | Field |
| header | Header |

### fetch_key_from_registry

```rust
fetch_key_from_registry(context, key_index, address, header);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |
| key_index | Field |
| address | AztecAddress |
| header | Header |

### fetch_and_constrain_keys

```rust
fetch_and_constrain_keys(address);
```

#### Parameters
| Name | Type |
| --- | --- |
| address | AztecAddress |

### get_nsk_app

```rust
get_nsk_app(npk_m_hash);
```

#### Parameters
| Name | Type |
| --- | --- |
| npk_m_hash | Field |

