# AppPayload

## Fields
| Field | Type |
| --- | --- |
| function_calls | FunctionCall; ACCOUNT_MAX_CALLS] |
| pub tx_nonce | Field |

## Methods

### to_be_bytes

Serializes the payload as an array of bytes. Useful for hashing with sha256.

```rust
AppPayload::to_be_bytes(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

### execute_calls

```rust
AppPayload::execute_calls(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |

## Standalone Functions

### hash

```rust
hash(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

