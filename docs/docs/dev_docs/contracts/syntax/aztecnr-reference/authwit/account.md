---
title: Account
---

# AccountActions
Manages account actions handling both private and public contexts.

## Struct Fields
| Field Name               | Type                                                    | Description                       |
|--------------------------|---------------------------------------------------------|-----------------------------------|
| context                  | Context                                                 | General context for actions       |
| is_valid_impl            | fn(&mut PrivateContext, Field) -> bool                  | Function to validate actions      |
| approved_action          | Map<PublicState<bool, BOOL_SERIALIZED_LEN>>             | Map of approved actions           |

## Methods

### init
Initializes an `AccountActions` instance.
#### Arguments
| Argument Name               | Type                                                  | Description                       |
|-----------------------------|-------------------------------------------------------|-----------------------------------|
| context                     | Context                                               | General context for actions       |
| approved_action_storage_slot| Field                                                 | Storage slot for approved actions |
| is_valid_impl               | fn(&mut PrivateContext, Field) -> bool                | Function to validate actions      |

### private
Initializes an `AccountActions` instance in a private context.
#### Arguments
| Argument Name               | Type                                                  | Description                       |
|-----------------------------|-------------------------------------------------------|-----------------------------------|
| context                     | &mut PrivateContext                                   | Private context for the action    |
| approved_action_storage_slot| Field                                                 | Storage slot for approved actions |
| is_valid_impl               | fn(&mut PrivateContext, Field) -> bool                | Function to validate actions      |

### public
Initializes an `AccountActions` instance in a public context.
#### Arguments
| Argument Name               | Type                                                  | Description                       |
|-----------------------------|-------------------------------------------------------|-----------------------------------|
| context                     | &mut PublicContext                                    | Public context for the action     |
| approved_action_storage_slot| Field                                                 | Storage slot for approved actions |
| is_valid_impl               | fn(&mut PrivateContext, Field) -> bool                | Function to validate actions      |

### entrypoint
Executes the entrypoint for an action.
#### Arguments
| Argument Name               | Type                                                  | Description                       |
|-----------------------------|-------------------------------------------------------|-----------------------------------|
| payload                     | EntrypointPayload                                     | Payload for the action            |

### is_valid
Checks if an action is valid in a private context.
#### Arguments
| Argument Name               | Type                                                  | Description                       |
|-----------------------------|-------------------------------------------------------|-----------------------------------|
| message_hash                | Field                                                 | Hash of the message to validate   |
#### Returns
| Return Name | Type               |
|-------------|--------------------|
|             | Field              |

### is_valid_public
Checks if an action is valid in a public context.
#### Arguments
| Argument Name               | Type                                                  | Description                       |
|-----------------------------|-------------------------------------------------------|-----------------------------------|
| message_hash                | Field                                                 | Hash of the message to validate   |
#### Returns
| Return Name | Type               |
|-------------|--------------------|
|             | Field              |

### internal_set_is_valid_storage
Sets the validity of an action in the storage.
#### Arguments
| Argument Name               | Type                                                  | Description                       |
|-----------------------------|-------------------------------------------------------|-----------------------------------|
| message_hash                | Field                                                 | Hash of the message to validate   |
| value                       | bool                                                  | Value to set for validity         |
