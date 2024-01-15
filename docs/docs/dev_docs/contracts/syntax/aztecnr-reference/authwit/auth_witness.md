---
title: Auth Witness
---

# assert_valid_authwit
Asserts that `on_behalf_of` has authorized `message_hash` with a valid authentication witness in a private context.
## Arguments
| Argument Name  | Type              | Description                              |
|----------------|-------------------|------------------------------------------|
| context        | &mut PrivateContext | Context for executing the assertion    |
| on_behalf_of   | AztecAddress      | Address on behalf of which to assert     |
| message_hash   | Field             | Hash of the message to authorize         |

# assert_current_call_valid_authwit
Asserts that `on_behalf_of` has authorized the current call with a valid authentication witness in a private context.
## Arguments
| Argument Name  | Type              | Description                              |
|----------------|-------------------|------------------------------------------|
| context        | &mut PrivateContext | Context for executing the assertion    |
| on_behalf_of   | AztecAddress      | Address on behalf of which to assert     |

# assert_valid_authwit_public
Asserts that `on_behalf_of` has authorized `message_hash` with a valid authentication witness in a public context.
## Arguments
| Argument Name  | Type             | Description                              |
|----------------|------------------|------------------------------------------|
| context        | &mut PublicContext | Context for executing the assertion   |
| on_behalf_of   | AztecAddress     | Address on behalf of which to assert     |
| message_hash   | Field            | Hash of the message to authorize         |

# assert_current_call_valid_authwit_public
Asserts that `on_behalf_of` has authorized the current call with a valid authentication witness in a public context.
## Arguments
| Argument Name  | Type             | Description                              |
|----------------|------------------|------------------------------------------|
| context        | &mut PublicContext | Context for executing the assertion   |
| on_behalf_of   | AztecAddress     | Address on behalf of which to assert     |

# compute_authwit_message_hash
Computes the message hash to be used by an authentication witness.
## Type Parameters
| Type Parameter | Description                             |
|----------------|-----------------------------------------|
| N              | The length of the array in arguments    |
## Arguments
| Argument Name  | Type              | Description                              |
|----------------|-------------------|------------------------------------------|
| caller         | AztecAddress      | Address of the caller                     |
| target         | AztecAddress      | Target address                           |
| selector       | FunctionSelector  | Selector for the function                 |
| args           | [Field; N]        | Arguments for the function                |
## Returns
| Return Name    | Type              |
|----------------|-------------------|
|                | Field             |
