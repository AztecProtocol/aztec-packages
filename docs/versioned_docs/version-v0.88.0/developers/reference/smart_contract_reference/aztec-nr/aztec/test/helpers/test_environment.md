# TestEnvironment

## Methods

### new

```rust
TestEnvironment::new();
```

Takes no parameters.

### _new

```rust
TestEnvironment::_new();
```

Takes no parameters.

### pending_block_number

```rust
TestEnvironment::pending_block_number(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### pending_timestamp

```rust
TestEnvironment::pending_timestamp(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### block_number

```rust
TestEnvironment::block_number(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |

### committed_block_number

```rust
TestEnvironment::committed_block_number(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |

### committed_timestamp

```rust
TestEnvironment::committed_timestamp(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self | Self |

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

### advance_timestamp_to

```rust
TestEnvironment::advance_timestamp_to(&mut self, timestamp);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| timestamp | u64 |

### advance_block_by

```rust
TestEnvironment::advance_block_by(_self, blocks);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | &mut Self |
| blocks | u32 |

### advance_timestamp_by

```rust
TestEnvironment::advance_timestamp_by(_self, duration);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | &mut Self |
| duration | u64 |

### public

```rust
TestEnvironment::public(_self);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |

### public_with_args_hash

```rust
TestEnvironment::public_with_args_hash(_self, args);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| args | [Field] |

### private

```rust
TestEnvironment::private(&mut self);
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |

### utility

```rust
TestEnvironment::utility(_self);
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

### private_at_timestamp

```rust
TestEnvironment::private_at_timestamp(&mut self, historical_timestamp, );
```

#### Parameters
| Name | Type |
| --- | --- |
| &mut self |  |
| historical_timestamp | u64 |
|  |  |

### create_account

```rust
TestEnvironment::create_account(_self, secret);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| secret | Field |

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
TestEnvironment::deploy(_self, path, name, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| path | str&lt;N&gt; |
| name | str&lt;M&gt; |
|  |  |

### deploy_self

```rust
TestEnvironment::deploy_self(_self, name);
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| name | str&lt;M&gt; |

### deploy_with_public_keys

```rust
TestEnvironment::deploy_with_public_keys(_self, path, name, secret, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| path | str&lt;N&gt; |
| name | str&lt;M&gt; |
| secret | Field |
|  |  |

### deploy_self_with_public_keys

```rust
TestEnvironment::deploy_self_with_public_keys(_self, name, secret, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| name | str&lt;M&gt; |
| secret | Field |
|  |  |

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

### call_private

```rust
TestEnvironment::call_private(_self, from, call_interface, T, N>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| from | AztecAddress |
| call_interface | PrivateCallInterface&lt;M |
| T |  |
| N&gt; |  |
|  |  |

### call_private_void

```rust
TestEnvironment::call_private_void(_self, from, call_interface, T, N>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| from | AztecAddress |
| call_interface | PrivateVoidCallInterface&lt;M |
| T |  |
| N&gt; |  |
|  |  |

### simulate_utility

```rust
TestEnvironment::simulate_utility(_self, call_interface, T, N>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| call_interface | UtilityCallInterface&lt;M |
| T |  |
| N&gt; |  |
|  |  |

### simulate_void_utility

```rust
TestEnvironment::simulate_void_utility(_self, call_interface, T, N>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| call_interface | UtilityCallInterface&lt;M |
| T |  |
| N&gt; |  |
|  |  |

### call_public

```rust
TestEnvironment::call_public(_self, from, call_interface, T, N>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| from | AztecAddress |
| call_interface | PublicCallInterface&lt;M |
| T |  |
| N&gt; |  |
|  |  |

### call_public_void

```rust
TestEnvironment::call_public_void(_self, from, call_interface, T, N>, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| from | AztecAddress |
| call_interface | PublicVoidCallInterface&lt;M |
| T |  |
| N&gt; |  |
|  |  |

### call_private_test

```rust
TestEnvironment::call_private_test(_self, from, call_interface, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| from | AztecAddress |
| call_interface | X |
|  |  |

### simulate_utility_test

```rust
TestEnvironment::simulate_utility_test(_self, call_interface, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| call_interface | X |
|  |  |

### call_public_test

```rust
TestEnvironment::call_public_test(_self, from, call_interface, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| from | AztecAddress |
| call_interface | X |
|  |  |

### add_note

```rust
TestEnvironment::add_note(_self, note, storage_slot, contract_address, );
```

#### Parameters
| Name | Type |
| --- | --- |
| _self | Self |
| note | Note |
| storage_slot | Field |
| contract_address | AztecAddress |
|  |  |

