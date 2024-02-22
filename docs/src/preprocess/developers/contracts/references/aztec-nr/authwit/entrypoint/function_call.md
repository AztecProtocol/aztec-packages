# FunctionCall

## Fields
| Field | Type |
| --- | --- |
| args_hash | Field |
| function_selector | FunctionSelector |
| target_address | AztecAddress |
| is_public | bool |

## Methods

### to_be_bytes

```rust
FunctionCall::to_be_bytes(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| u8; FUNCTION_CALL_SIZE_IN_BYTES] |

## Standalone Functions

### serialize

```rust
serialize(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Field; FUNCTION_CALL_SIZE] |

