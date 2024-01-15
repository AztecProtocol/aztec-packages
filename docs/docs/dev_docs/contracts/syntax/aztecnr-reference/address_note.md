---
title: Address Note
---

Stores an address along with its associated details.

## Struct Fields
| Field Name | Type           | Description           |
|------------|----------------|-----------------------|
| address    | AztecAddress   | The Aztec address     |
| owner      | AztecAddress   | Owner of the address  |
| randomness | Field          | Randomness value      |
| header     | NoteHeader     | Note header           |

## Methods

### new
Creates a new `AddressNote` instance.
#### Arguments
| Argument Name | Type          | Description           |
|---------------|---------------|-----------------------|
| address       | AztecAddress  | The Aztec address     |
| owner         | AztecAddress  | Owner of the address  |

### serialize
Serializes the `AddressNote` into an array of Fields.
#### Returns
| Return Name | Type               |
|-------------|--------------------|
|             | [Field; ADDRESS_NOTE_LEN] |

### deserialize
Deserializes an array of Fields into an `AddressNote`.
#### Arguments
| Argument Name | Type               | Description           |
|---------------|--------------------|-----------------------|
| serialized_note | [Field; ADDRESS_NOTE_LEN] | Serialized note |

### compute_note_hash
Computes a hash for the `AddressNote`.
#### Returns
| Return Name | Type               |
|-------------|--------------------|
|             | Field              |

### compute_nullifier
Computes a nullifier for the `AddressNote`.
#### Returns
| Return Name | Type               |
|-------------|--------------------|
|             | Field              |

### set_header
Sets the header of the `AddressNote`.
#### Arguments
| Argument Name | Type          | Description       |
|---------------|---------------|-------------------|
| header        | NoteHeader    | New note header   |

### broadcast
Broadcasts the note as an encrypted log on L1.
#### Arguments
| Argument Name | Type              | Description               |
|---------------|-------------------|---------------------------|
| context       | &mut PrivateContext | Context for the operation |
| slot          | Field              | Slot for broadcasting     |

## Global Functions

### deserialize
#### Arguments
| Argument Name | Type               | Description           |
|---------------|--------------------|-----------------------|
| serialized_note | [Field; ADDRESS_NOTE_LEN] | Serialized note |

### serialize
#### Arguments
| Argument Name | Type         | Description   |
|---------------|--------------|---------------|
| note          | AddressNote  | Note to serialize |

### compute_note_hash
#### Arguments
| Argument Name | Type         | Description   |
|---------------|--------------|---------------|
| note          | AddressNote  | Note to compute hash for |

### compute_nullifier
#### Arguments
| Argument Name | Type         | Description   |
|---------------|--------------|---------------|
| note          | AddressNote  | Note to compute nullifier for |

### get_header
#### Arguments
| Argument Name | Type         | Description   |
|---------------|--------------|---------------|
| note          | AddressNote  | Note to get header from |

### set_header
#### Arguments
| Argument Name | Type         | Description   |
|---------------|--------------|---------------|
| note          | &mut AddressNote | Note to set header for |
| header        | NoteHeader    | New note header   |

### broadcast
#### Arguments
| Argument Name | Type              | Description               |
|---------------|-------------------|---------------------------|
| context       | &mut PrivateContext | Context for the operation |
| slot          | Field              | Slot for broadcasting     |
| note          | AddressNote        | Note to broadcast         |
