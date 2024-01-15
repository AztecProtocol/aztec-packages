---
title: Entrypoint
---

# FunctionCall
Represents a function call.

## Struct Fields
| Field Name         | Type              | Description             |
|--------------------|-------------------|-------------------------|
| args_hash          | Field             | Hash of the arguments   |
| function_selector  | FunctionSelector  | Selector for the function |
| target_address     | AztecAddress      | Address of the target   |
| is_public          | bool              | Whether the call is public |

## Methods

### serialize
Serializes the `FunctionCall` into an array of Fields.
#### Returns
| Return Name | Type                         |
|-------------|------------------------------|
|             | [Field; FUNCTION_CALL_SIZE]  |

### to_be_bytes
Converts the `FunctionCall` into a byte array.
#### Returns
| Return Name | Type                               |
|-------------|------------------------------------|
|             | [u8; FUNCTION_CALL_SIZE_IN_BYTES]  |

# EntrypointPayload
Encapsulates function calls for the entrypoint.

## Struct Fields
| Field Name      | Type                           | Description                 |
|-----------------|--------------------------------|-----------------------------|
| function_calls  | [FunctionCall; ACCOUNT_MAX_CALLS] | Array of function calls    |
| nonce           | Field                          | Nonce for the payload       |

## Methods

### hash
Computes a hash of the `EntrypointPayload`.
#### Returns
| Return Name | Type         |
|-------------|--------------|
|             | Field        |

### serialize
Serializes the `EntrypointPayload` into an array of Fields.
#### Returns
| Return Name | Type                             |
|-------------|----------------------------------|
|             | [Field; ENTRYPOINT_PAYLOAD_SIZE] |

### to_be_bytes
Converts the `EntrypointPayload` into a byte array.
#### Returns
| Return Name | Type                                    |
|-------------|-----------------------------------------|
|             | [u8; ENTRYPOINT_PAYLOAD_SIZE_IN_BYTES]  |

### execute_calls
Executes all private and public calls in the payload.
#### Arguments
| Argument Name  | Type                | Description                 |
|----------------|---------------------|-----------------------------|
| context        | &mut PrivateContext | Context for executing calls |
