# Type Definitions

This section lists type definitions relevant to the AVM's World State, Accrued Substate and Circuit's I/O.

#### _TracedContractCall_

| Field             | Type     | Description                 |
| ---               | ---      | ---                         |
| `contractAddress` | `field`  | Contract address of a call. |
| `endLifetime`     | `field`  | End lifetime of a call. 0 for successful calls. Last `clk` for reverted calls. |

#### _TracedRootRead_

| Field         | Type     | Description                       |
| ---           | ---      | ---                               |
| `blockNumber` | `field`  | Block number to retrieve root at. |
| `root`        | `field`  | Root of the tree.                 |

> Note: The header structure is defined

##### Tree indices

Trees are sometimes referred to by the following indices:

| Index | Tree                   |
| ---   | ---                    |
| 0     | Note Hash Tree         |
| 1     | Nullifier Tree         |
| 2     | L1-to-L2 Messages Tree |
| 3     | Public Data Tree       |
| 4     | Archive Tree           |

#### _TracedL1ToL2MessageRead_

| Field             | Type                                   | Description |
| ---               | ---                                    | ---         |
| `callPtr`         | `field`                                | Associates this item with a `ContractCallContext` entry in `SessionState.contractCalls` |
| `portal`          | `EthAddress`                           |             |
| `msgKey`          | `field`                                |             |
| `message`         | `[field; MAX_L1_TO_L2_MESSAGE_LENGTH]` |             |

#### _TracedStorageRead_

| Field                | Type           | Description |
| ---                  | ---            | ---         |
| `callPtr`            | `field`        | Associates this item with a `ContractCallContext` entry in `SessionState.contractCalls` |
| `slot`               | `field`        |             |
| `value`              | `field`        |             |

#### _TracedStorageWrite_

| Field                | Type           | Description |
| ---                  | ---            | ---         |
| `callPtr`            | `field`        | Associates this item with a `ContractCallContext` entry in `SessionState.contractCalls`|
| `slot`               | `field`        |             |
| `value`              | `field`        |             |
| `counter`            | `field`        |             |

#### _TracedNoteHash_

| Field                | Type           | Description |
| ---                  | ---            | ---         |
| `callPtr`            | `field`        | Associates this item with a `ContractCallContext` entry in `SessionState.contractCalls` |
| `value`              | `field`        |             |
| `counter`            | `field`        |             |

> Note: `value` here is not siloed by contract address nor is it made unique with a nonce. Note hashes are siloed and made unique by the public kernel.

#### _TracedNullifier_

| Field                | Type           | Description |
| ---                  | ---            | ---         |
| `callPtr`            | `field`        | Associates this item with a `ContractCallContext` entry in `SessionState.contractCalls` |
| `value`              | `field`        |             |
| `counter`            | `field`        |             |

#### _IndexedLeafCheck_

| Field                | Type           | Description |
| ---                  | ---            | ---         |
| `callPtr`            | `field`        | Associates this item with a `ContractCallContext` entry in `SessionState.contractCalls` |
| `leaf`               | `field`        |             |
| `counter`            | `field`        |             |

#### _LeafCheck_

| Field                | Type           | Description |
| ---                  | ---            | ---         |
| `callPtr`            | `field`        | Associates this item with a `ContractCallContext` entry in `SessionState.contractCalls` |
| `leaf`               | `field`        |             |
| `index`              | `field`        |             |
| `counter`            | `field`        |             |


#### _UnencryptedLog_

| Field             | Type                                  | Description |
| ---               | ---                                   | ---         |
| `contractAddress` | `AztecAddress`                        |             |
| `log`             | `[field; MAX_UNENCRYPTED_LOG_LENGTH]` |             |

#### _SentL2ToL1Message_

| Field             | Type                                   | Description |
| ---               | ---                                    | ---         |
| `contractAddress` | `AztecAddress`                         |             |
| `portalAddress`   | `EthAddress`                           |             |
| `message`         | `[field, MAX_L2_TO_L1_MESSAGE_LENGTH]` |             |
