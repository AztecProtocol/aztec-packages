# State

This section describes the types of state maintained by the AVM.

## Machine State

**Machine state** is transformed on an instruction-per-instruction basis. Each execution context has its own machine state.

### _MachineState_

| Field                 | Type            | Description |
| ---                   | ---             | ---         |
| `l1GasLeft`           | `field`         | Tracks the amount of L1 gas remaining at any point during execution. |
| `l2GasLeft`           | `field`         | Tracks the amount of L2 gas remaining at any point during execution. |
| `daGasLeft`           | `field`         | Tracks the amount of DA gas remaining at any point during execution. |
| `pc`                  | `field`         | Index into the contract's bytecode indicating which instruction to execute. Initialized\* to 0. |
| `internalCallStack`   | `Vector<field>` | A stack of program counters pushed to and popped from by `INTERNALCALL` and `INTERNALRETURN` instructions. Initialized\* as empty. |
| `memory`              | `[field; 2^32]` | A $2^{32}$ entry memory space accessible by user code (bytecode instructions). All 2^32 entries are initialized\* to 0. See ["Memory Model"](./memory-model) for a complete description of AVM memory. |

## World State

### AVM's access to Aztec State
Aztec's global state is comprised of a few databases most of which have merkle tree implementations. For a comprehensive guide to Aztec's global state, see ["State"](../state). For a guide to state as it pertains to contract classes and instances see ["Contract Deployment"](../contract-deployment).

Aztec state is exposed to the AVM with access limitations that are stricter in some cases than they are for private execution. The relevant state databases are listed below alongside their underlying tree types (when applicable) and the access limitations imposed for the AVM.

| State DB             | State Tree          | Tree Type                                       | Access                                                |
| ---                  | ---                 | ---                                             | ---                                                   |
| `noteHashDB`         | `noteHashTree`      | Append-only, non-indexed merkle tree            | appends, historic root                                |
| `nullifierDB`        | `nullifierTree`     | Indexed merkle tree                             | membership-checks, appends, historic root             |
| `l1ToL2MessageDB`    | `l1ToL2MessageTree` | Indexed merkle tree                             | membership-checks, leaf-preimage-reads, historic root |
| `publicDataDB`       | `publicDataTree`    | Indexed merkle tree                             | membership-checks, reads, writes, historic root       |
| `archiveDB`          | `archiveTree`       | Append-only, non-indexed merkle tree            | membership-checks, historic root                      |
| `contractClassDB`    | -                   | -                                               | read, write                                           |
| `contractInstanceDB` | -                   | -                                               | read, write                                           |

> As described in ["Contract Deployment"](../contract-deployment), contracts are not stored in any single tree. A [contract class](../contract-deployment/classes) is [represented](../contract-deployment/classes#registration) as an unencrypted log containing the `ContractClass` structure (which contains the bytecode) and a nullifier representing the class identifier. The `contractClassDB` stores contract classes indexed by class identifier. A [contract instance](../contract-deployment/instances) is [represented](../contract-deployment/classes#registration) as an unencrypted log containing the `ContractInstance` structure and a nullifier representing the contract address. The `contractInstanceDB` stores contract instances indexed by contract address.

### AVM World State

The AVM does not directly modify Aztec state. Instead, it stages modifications to be applied later pending successful execution. As part of each execution context, the AVM maintains **world state** which is a representation of Aztec state that includes _staged_ modifications.

As the AVM executes contract code, instructions may read or modify the world state within the current context. If execution within a particular context reverts, staged world state modifications are rejected by the caller. If execution succeeds, staged world state modifications are accepted. This process of staging modifications to be conditionally accepted by the caller is referred to as **journaling**.

### World State Access Trace

**The circuit implementation of the AVM does _not_ prove that its world state accesses are valid and properly sequenced.** Thus, _all_ world state accesses, **regardless of whether they are rejected due to a revert**, must be traced and eventually handed off to the public kernel circuit for comprehensive validation.

This trace of an AVM session's contract calls and world state accesses is named the **world state access trace**.

> The world state access trace is also important for enforcing limitations on the maximum number of allowable world state accesses.

#### _WorldStateAccessTrace_

Each entry in the world state access trace is listed below along with its type and the instructions that append to it:

| Trace                 | Relevant State     | Trace Vector Type                  | Instructions         |
| ---                   | ---                | ---                                | ---                  |
| `publicStorageReads`  | `publicDataDB`     | `Vector<TracedStorageRead>`        | `SLOAD`              |
| `publicStorageWrites` | `publicDataDB`     | `Vector<TracedStorageWrite>`       | `SSTORE`             |
| `l1ToL2MessageReads`  | `l1ToL2MessagesDB` | `Vector<TracedL1ToL2MessageRead>`  | `READL1TOL2MSG`      |
| `newNoteHashes`       | `noteHashDB`       | `Vector<TracedNoteHash>`           | `EMITNOTEHASH`       |
| `newNullifiers`       | `nullifierDB`      | `Vector<TracedNullifier>`          | `EMITNULLIFIER`      |
| `nullifierChecks`     | `nullifierDB`      | `Vector<TracedIndexedLeafCheck>`   | `CHECKNULLIFIER`     |
| `archiveChecks`       | `archiveDB`        | `Vector<TracedLeafCheck>`          | `CHECKARCHIVE`       |
| `<tree>RootReads`     | `<tree>DB`         | `Vector<TracedTreeRootRead>`       | `<TREE>ROOT`         |
| `contractCalls`       | `contract*DB`      | `Vector<AztecAddress>`             | `*CALL`              |

> The types tracked in these trace vectors are defined [here](./type-structs).

> The syntax `*CALL` is short for `CALL`/`STATICCALL`/`DELEGATECALL`.

> There is a "root read" trace and instruction for each tree (`noteHashRootReads`, `NOTEHASHROOT`, `nullifierRootReads`, `NULLIFIERROOT`, etc.).


A world state tree may be accessed in one or more ways from within the AVM. For a given tree, each supported world state access type has a dedicated instruction and access trace. This information is presented in the table below.

| Instructions        | Description |
| ---                 | ---         |
| `SLOAD`             | Read a public storage slot value. Trigger a membership check of its leaf in the public data tree. |
| `SSTORE`            | Write a value to a public storage slot. Trigger an update to its leaf in the public data tree.    |
| `READL1TOL2MSG`     | Read an entire L1-to-L2 message preimage and trigger a membership check of its message tree leaf. |
| `EMITNOTEHASH`      | Append a note hash to the note hash tree. |
| `EMITNULLIFIER`     | Append a nullifier to the nullifier tree. |
| `CHECKNULLIFIER`    | Trigger a membership check of the specified leaf of the nullifier tree. |
| `CHECKARCHIVE`      | Trigger a membership check of the specified leaf of the archive tree. |
| `*ROOT`             | Retrieve a tree root as of a specified block number. |
| `*CALL`             | Initiate a nested contract call. Trigger membership checks for the contract class identifier nullifier and contract address nullifier. |


Tree operations like membership checks, appends, or leaf updates are technically performed by the public kernel and rollup circuits, _after_ AVM execution. The world state access trace acts as a list of requests made by the AVM for later circuits to perform such actions.

## Accrued Substate

> The term "accrued substate" is borrowed from the [Ethereum Yellow Paper](https://ethereum.github.io/yellowpaper/paper).

The **accrued substate** contains information that is accrued throughout transaction execution to be "acted upon immediately following the transaction." These are append-only arrays containing state that is not relevant to other calls. Similar to world state, if a contract call returns normally, its substate is appended to its calling context, but if it reverts its substate is rejected by its caller.

**Accrued substate** is accrued throughout a context's execution, but updates to it are strictly never relevant to subsequent instructions, contract call, or transactions. An execution context is always initialized with empty accrued substate, and instructions can append to it. If a contract's execution succeeds, its accrued substate is appended to the caller's. If a contract's execution reverts, its accrued substate is ignored. There is no accrued substate "trace" that includes entries from reverted contexts. An AVM session's (an initial contract call's) final accrued substate is handed off to the public kernel circuit for further processing.

#### _AccruedSubstate_
| Field                | Type                        | Instructions    | Description |
| ---                  | ---                         | ---             | ---         |
| `unencryptedLogs`    | `Vector<UnencryptedLog>`    | `ULOG`          |  |
| `sentL2ToL1Messages` | `Vector<SentL2ToL1Message>` | `SENDL1TOL2MSG` |  |

> The types tracked in these vectors are defined [here](./type-structs).
