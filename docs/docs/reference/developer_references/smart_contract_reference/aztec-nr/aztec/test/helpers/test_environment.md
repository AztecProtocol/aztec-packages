# TestEnvironment

## Methods

### new

```rust
TestEnvironment::new();
```

Takes no parameters.

### block_number

```rust
TestEnvironment::block_number(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### contract_address

```rust
TestEnvironment::contract_address(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### impersonate

```rust
TestEnvironment::impersonate(_self, address);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| address | AztecAddress |

### advance_block_to

```rust
TestEnvironment::advance_block_to(&mut self, block_number);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| block_number | u32 |

### advance_block_by

```rust
TestEnvironment::advance_block_by(_self, blocks);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | &mut Self |
| blocks | u32 |

### public

```rust
TestEnvironment::public(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### private

```rust
TestEnvironment::private(&mut self);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |

### unkonstrained

unconstrained is a key word, so we mis-spell purposefully here, like we do with contrakt

```rust
TestEnvironment::unkonstrained(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### private_at

```rust
TestEnvironment::private_at(&mut self, historical_block_number);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| historical_block_number | u32 |

### create_account

```rust
TestEnvironment::create_account(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### create_account_contract

```rust
TestEnvironment::create_account_contract(&mut self, secret);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| secret | Field |

### deploy

```rust
TestEnvironment::deploy(self, path, name);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| path | str&lt;N&gt; |
| name | str&lt;M&gt; |

### deploy_self

```rust
TestEnvironment::deploy_self(self, name);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| name | str&lt;M&gt; |

### call_private

```rust
TestEnvironment::call_private(_self, call_interface);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| call_interface | C |

### call_private_void

```rust
TestEnvironment::call_private_void(_self, call_interface);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| call_interface | C |

### call_public

```rust
TestEnvironment::call_public(_self, call_interface);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| call_interface | C |

### assert_public_call_fails

```rust
TestEnvironment::assert_public_call_fails(_self, call_interface);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| call_interface | C |

### assert_private_call_fails

```rust
TestEnvironment::assert_private_call_fails(_self, call_interface);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| call_interface | C |

### store_note_in_cache

```rust
TestEnvironment::store_note_in_cache(_self, note, storage_slot, contract_address);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| note | &mut Note |
| storage_slot | Field |
| contract_address | AztecAddress |

