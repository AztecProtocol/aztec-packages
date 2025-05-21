# FunctionCall

## Fields
| Field | Type |
| --- | --- |
| pub args_hash | Field, /* args_hash is calldata_hash if is_public is true */ |
| pub function_selector | FunctionSelector |
| pub target_address | AztecAddress |
| pub is_public | bool |
| pub is_static | bool |

## Methods

### to_be_bytes

```rust
FunctionCall::to_be_bytes(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

