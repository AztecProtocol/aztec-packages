# FeePayload

## Fields
| Field | Type |
| --- | --- |
| function_calls | FunctionCall; MAX_FEE_FUNCTION_CALLS] |
| nonce | Field |

## Methods

### to_be_bytes

```rust
FeePayload::to_be_bytes(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| u8; FEE_PAYLOAD_SIZE_IN_BYTES] |

### execute_calls

```rust
FeePayload::execute_calls(self, context);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |
| context | &mut PrivateContext |

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
| Field; FEE_PAYLOAD_SIZE] |

### hash

```rust
hash(self);
```

#### Parameters
| Name | Type |
| --- | --- |
| self |  |

#### Returns
| Type |
| --- |
| Field |

