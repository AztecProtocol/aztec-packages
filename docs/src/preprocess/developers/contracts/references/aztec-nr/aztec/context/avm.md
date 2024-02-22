# AVMContext

Getters that will be converted by the transpiler into their own opcodes

## Methods

### new

Empty new function enables retaining context.&lt;value&gt; syntax

```rust
AVMContext::new();
```

Takes no parameters.

#### Returns
| Type |
| --- |
| Self |

### address

```rust
AVMContext::address(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| AztecAddress |

### storage_address

```rust
AVMContext::storage_address(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| AztecAddress |

### origin

```rust
AVMContext::origin(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| AztecAddress |

### sender

```rust
AVMContext::sender(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| AztecAddress |

### portal

```rust
AVMContext::portal(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| EthAddress |

### fee_per_l1_gas

```rust
AVMContext::fee_per_l1_gas(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Field |

### fee_per_l2_gas

```rust
AVMContext::fee_per_l2_gas(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Field |

### fee_per_da_gas

```rust
AVMContext::fee_per_da_gas(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Field |

### chain_id

```rust
AVMContext::chain_id(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Field |

### version

```rust
AVMContext::version(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Field |

### block_number

```rust
AVMContext::block_number(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Field |

### timestamp

```rust
AVMContext::timestamp(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Field |

### contract_call_depth

```rust
AVMContext::contract_call_depth(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Field |

