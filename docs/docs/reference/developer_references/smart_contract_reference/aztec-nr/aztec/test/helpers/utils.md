# TestAccount

## Fields
| Field | Type |
| --- | --- |
| address | AztecAddress |
| keys | PublicKeys |

## Standalone Functions

### apply_side_effects_private

```rust
apply_side_effects_private(contract_address, public_inputs);
```

#### Parameters
| Name | Type |
| --- | --- |
| contract_address | AztecAddress |
| public_inputs | PrivateCircuitPublicInputs |

### with_private_initializer

```rust
with_private_initializer(self, call_interface);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| call_interface | C |

### with_public_initializer

```rust
with_public_initializer(self, call_interface);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| call_interface | C |

### without_initializer

```rust
without_initializer(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### serialize

```rust
serialize(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### deserialize

```rust
deserialize(input);
```

#### Parameters
| Name | Type |
| --- | --- |
| input | [Field; TEST_ACCOUNT_LENGTH] |

