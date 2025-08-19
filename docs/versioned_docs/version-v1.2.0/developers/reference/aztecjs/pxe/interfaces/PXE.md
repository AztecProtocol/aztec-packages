---
id: "PXE"
title: "Interface: PXE"
sidebar_label: "PXE"
sidebar_position: 0
custom_edit_url: null
---

Private eXecution Environment (PXE) runs locally for each user, providing functionality for all the operations
needed to interact with the Aztec network, including account management, private data management,
transaction local simulation, and access to an Aztec node. This interface, as part of a Wallet,
is exposed to dapps for interacting with the network on behalf of the user.

## Methods

### getBlock

▸ **getBlock**(`number`): `Promise`\<`undefined` \| `L2Block`\>

Get the given block.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `number` | `number` | The block number being requested. |

#### Returns

`Promise`\<`undefined` \| `L2Block`\>

The blocks requested.

___

### getBlockNumber

▸ **getBlockNumber**(): `Promise`\<`number`\>

Fetches the current block number.

#### Returns

`Promise`\<`number`\>

The block number.

___

### getContractClassLogs

▸ **getContractClassLogs**(`filter`): `Promise`\<`GetContractClassLogsResponse`\>

Gets contract class logs based on the provided filter.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `filter` | `LogFilter` | The filter to apply to the logs. |

#### Returns

`Promise`\<`GetContractClassLogsResponse`\>

The requested logs.

___

### getContractClassMetadata

▸ **getContractClassMetadata**(`id`, `includeArtifact?`): `Promise`\<[`ContractClassMetadata`](ContractClassMetadata.md)\>

Returns the contract class metadata given a contract class id.
The metadata consists of its contract class, whether it has been publicly registered, and its artifact.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `id` | `Fr` | Identifier of the class. |
| `includeArtifact?` | `boolean` | Identifier of the class. |

#### Returns

`Promise`\<[`ContractClassMetadata`](ContractClassMetadata.md)\>

- It returns the contract class metadata, with the artifact field being optional, and will only be returned if true is passed in
for `includeArtifact`
TODO(@spalladino): The PXE actually holds artifacts and not classes, what should we return? Also,
should the pxe query the node for contract public info, and merge it with its own definitions?
TODO(@spalladino): This method is strictly needed to decide whether to publicly register a class or not
during a public deployment. We probably want a nicer and more general API for this, but it'll have to
do for the time being.

**`Remark`**

- it queries the node to check whether the contract class with the given id has been publicly registered.

___

### getContractMetadata

▸ **getContractMetadata**(`address`): `Promise`\<[`ContractMetadata`](ContractMetadata.md)\>

Returns the contract metadata given an address.
The metadata consists of its contract instance, which includes the contract class identifier,
initialization hash, deployment salt, and public keys hash; whether the contract instance has been initialized;
and whether the contract instance with the given address has been publicly deployed.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `address` | `AztecAddress` | The address that the contract instance resides at. |

#### Returns

`Promise`\<[`ContractMetadata`](ContractMetadata.md)\>

- It returns the contract metadata
TODO(@spalladino): Should we return the public keys in plain as well here?

**`Remark`**

- it queries the node to check whether the contract instance has been initialized / publicly deployed through a node.
This query is not dependent on the PXE.

___

### getContracts

▸ **getContracts**(): `Promise`\<`AztecAddress`[]\>

Retrieves the addresses of contracts added to this PXE Service.

#### Returns

`Promise`\<`AztecAddress`[]\>

An array of contracts addresses registered on this PXE Service.

___

### getCurrentBaseFees

▸ **getCurrentBaseFees**(): `Promise`\<`GasFees`\>

Method to fetch the current base fees.

#### Returns

`Promise`\<`GasFees`\>

The current base fees.

___

### getL1ToL2MembershipWitness

▸ **getL1ToL2MembershipWitness**(`contractAddress`, `messageHash`, `secret`): `Promise`\<[`bigint`, `SiblingPath`\<``39``\>]\>

Fetches an L1 to L2 message from the node.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `contractAddress` | `AztecAddress` | Address of a contract by which the message was emitted. |
| `messageHash` | `Fr` | Hash of the message. |
| `secret` | `Fr` | Secret used to compute a nullifier. |

#### Returns

`Promise`\<[`bigint`, `SiblingPath`\<``39``\>]\>

The l1 to l2 membership witness (index of message in the tree and sibling path).

**`Dev`**

Contract address and secret are only used to compute the nullifier to get non-nullified messages

___

### getL2ToL1MembershipWitness

▸ **getL2ToL1MembershipWitness**(`blockNumber`, `l2Tol1Message`): `Promise`\<[`bigint`, `SiblingPath`\<`number`\>]\>

Gets the membership witness for a message that was emitted at a particular block

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `blockNumber` | `number` | The block number in which to search for the message |
| `l2Tol1Message` | `Fr` | The message to search for |

#### Returns

`Promise`\<[`bigint`, `SiblingPath`\<`number`\>]\>

The membership witness for the message

___

### getNodeInfo

▸ **getNodeInfo**(): `Promise`\<`NodeInfo`\>

Returns the information about the server's node. Includes current Node version, compatible Noir version,
L1 chain identifier, rollup version, and L1 address of the rollup contract.

#### Returns

`Promise`\<`NodeInfo`\>

- The node information.

___

### getNotes

▸ **getNotes**(`filter`): `Promise`\<`UniqueNote`[]\>

Gets notes registered in this PXE based on the provided filter.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `filter` | `NotesFilter` | The filter to apply to the notes. |

#### Returns

`Promise`\<`UniqueNote`[]\>

The requested notes.

___

### getPXEInfo

▸ **getPXEInfo**(): `Promise`\<[`PXEInfo`](PXEInfo.md)\>

Returns information about this PXE.

#### Returns

`Promise`\<[`PXEInfo`](PXEInfo.md)\>

___

### getPrivateEvents

▸ **getPrivateEvents**\<`T`\>(`contractAddress`, `eventMetadata`, `from`, `numBlocks`, `recipients`): `Promise`\<`T`[]\>

Returns the private events given search parameters.

#### Type parameters

| Name |
| :------ |
| `T` |

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `contractAddress` | `AztecAddress` | The address of the contract to get events from. |
| `eventMetadata` | [`EventMetadataDefinition`](../#eventmetadatadefinition) | Metadata of the event. This should be the class generated from the contract. e.g. Contract.events.Event |
| `from` | `number` | The block number to search from. |
| `numBlocks` | `number` | The amount of blocks to search. |
| `recipients` | `AztecAddress`[] | The addresses that decrypted the logs. |

#### Returns

`Promise`\<`T`[]\>

- The deserialized events.

___

### getProvenBlockNumber

▸ **getProvenBlockNumber**(): `Promise`\<`number`\>

Fetches the current proven block number.

#### Returns

`Promise`\<`number`\>

The block number.

___

### getPublicEvents

▸ **getPublicEvents**\<`T`\>(`eventMetadata`, `from`, `limit`): `Promise`\<`T`[]\>

Returns the public events given search parameters.

#### Type parameters

| Name |
| :------ |
| `T` |

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `eventMetadata` | [`EventMetadataDefinition`](../#eventmetadatadefinition) | Metadata of the event. This should be the class generated from the contract. e.g. Contract.events.Event |
| `from` | `number` | The block number to search from. |
| `limit` | `number` | The amount of blocks to search. |

#### Returns

`Promise`\<`T`[]\>

- The deserialized events.

___

### getPublicLogs

▸ **getPublicLogs**(`filter`): `Promise`\<`GetPublicLogsResponse`\>

Gets public logs based on the provided filter.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `filter` | `LogFilter` | The filter to apply to the logs. |

#### Returns

`Promise`\<`GetPublicLogsResponse`\>

The requested logs.

___

### getPublicStorageAt

▸ **getPublicStorageAt**(`contract`, `slot`): `Promise`\<`Fr`\>

Gets the storage value at the given contract storage slot.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `contract` | `AztecAddress` | Address of the contract to query. |
| `slot` | `Fr` | Slot to query. |

#### Returns

`Promise`\<`Fr`\>

Storage value at the given contract slot.

**`Remarks`**

The storage slot here refers to the slot as it is defined in Noir not the index in the merkle tree.
Aztec's version of `eth_getStorageAt`.

**`Throws`**

If the contract is not deployed.

___

### getRegisteredAccounts

▸ **getRegisteredAccounts**(): `Promise`\<`CompleteAddress`[]\>

Retrieves the user accounts registered on this PXE Service.

#### Returns

`Promise`\<`CompleteAddress`[]\>

An array of the accounts registered on this PXE Service.

___

### getSenders

▸ **getSenders**(): `Promise`\<`AztecAddress`[]\>

Retrieves the addresses stored as senders on this PXE Service.

#### Returns

`Promise`\<`AztecAddress`[]\>

An array of the senders on this PXE Service.

___

### getTxEffect

▸ **getTxEffect**(`txHash`): `Promise`\<`undefined` \| `IndexedTxEffect`\>

Gets a tx effect.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `txHash` | `TxHash` | The hash of the tx corresponding to the tx effect. |

#### Returns

`Promise`\<`undefined` \| `IndexedTxEffect`\>

The requested tx effect with block info (or undefined if not found).

___

### getTxReceipt

▸ **getTxReceipt**(`txHash`): `Promise`\<`TxReceipt`\>

Fetches a transaction receipt for a given transaction hash. Returns a mined receipt if it was added
to the chain, a pending receipt if it's still in the mempool of the connected Aztec node, or a dropped
receipt if not found in the connected Aztec node.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `txHash` | `TxHash` | The transaction hash. |

#### Returns

`Promise`\<`TxReceipt`\>

A receipt of the transaction.

___

### isL1ToL2MessageSynced

▸ **isL1ToL2MessageSynced**(`l1ToL2Message`): `Promise`\<`boolean`\>

Returns whether an L1 to L2 message is synced by archiver and if it's ready to be included in a block.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `l1ToL2Message` | `Fr` | The L1 to L2 message to check. |

#### Returns

`Promise`\<`boolean`\>

Whether the message is synced and ready to be included in a block.

___

### profileTx

▸ **profileTx**(`txRequest`, `profileMode`, `skipProofGeneration?`, `msgSender?`): `Promise`\<`TxProfileResult`\>

Profiles a transaction, reporting gate counts (unless disabled) and returns an execution trace.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `txRequest` | `TxExecutionRequest` | An authenticated tx request ready for simulation |
| `profileMode` | ``"gates"`` \| ``"execution-steps"`` \| ``"full"`` | - |
| `skipProofGeneration?` | `boolean` | - |
| `msgSender?` | `AztecAddress` | (Optional) The message sender to use for the simulation. |

#### Returns

`Promise`\<`TxProfileResult`\>

A trace of the program execution with gate counts.

**`Throws`**

If the code for the functions executed in this transaction have not been made available via `addContracts`.

___

### proveTx

▸ **proveTx**(`txRequest`, `privateExecutionResult?`): `Promise`\<`TxProvingResult`\>

Proves the private portion of a simulated transaction, ready to send to the network
(where validators prove the public portion).

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `txRequest` | `TxExecutionRequest` | An authenticated tx request ready for proving |
| `privateExecutionResult?` | `PrivateExecutionResult` | (optional) The result of the private execution of the transaction. The txRequest will be executed if not provided |

#### Returns

`Promise`\<`TxProvingResult`\>

A result containing the proof and public inputs of the tail circuit.

**`Throws`**

If contract code not found, or public simulation reverts.
Also throws if simulatePublic is true and public simulation reverts.

___

### registerAccount

▸ **registerAccount**(`secretKey`, `partialAddress`): `Promise`\<`CompleteAddress`\>

Registers a user account in PXE given its master encryption private key.
Once a new account is registered, the PXE Service will trial-decrypt all published notes on
the chain and store those that correspond to the registered account. Will do nothing if the
account is already registered.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `secretKey` | `Fr` | Secret key of the corresponding user master public key. |
| `partialAddress` | `Fr` | The partial address of the account contract corresponding to the account being registered. |

#### Returns

`Promise`\<`CompleteAddress`\>

The complete address of the account.

___

### registerContract

▸ **registerContract**(`contract`): `Promise`\<`void`\>

Adds deployed contracts to the PXE Service. Deployed contract information is used to access the
contract code when simulating local transactions. This is automatically called by aztec.js when
deploying a contract. Dapps that wish to interact with contracts already deployed should register
these contracts in their users' PXE Service through this method.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `contract` | `Object` | A contract instance to register, with an optional artifact which can be omitted if the contract class has already been registered. |
| `contract.artifact?` | `ContractArtifact` | - |
| `contract.instance` | `ContractInstanceWithAddress` | - |

#### Returns

`Promise`\<`void`\>

___

### registerContractClass

▸ **registerContractClass**(`artifact`): `Promise`\<`void`\>

Registers a contract class in the PXE without registering any associated contract instance with it.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `artifact` | `ContractArtifact` | The build artifact for the contract class. |

#### Returns

`Promise`\<`void`\>

___

### registerSender

▸ **registerSender**(`address`): `Promise`\<`AztecAddress`\>

Registers a user contact in PXE.

Once a new contact is registered, the PXE Service will be able to receive notes tagged from this contact.
Will do nothing if the account is already registered.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `address` | `AztecAddress` | Address of the user to add to the address book |

#### Returns

`Promise`\<`AztecAddress`\>

The address address of the account.

___

### removeSender

▸ **removeSender**(`address`): `Promise`\<`void`\>

Removes a sender in the address book.

#### Parameters

| Name | Type |
| :------ | :------ |
| `address` | `AztecAddress` |

#### Returns

`Promise`\<`void`\>

___

### sendTx

▸ **sendTx**(`tx`): `Promise`\<`TxHash`\>

Sends a transaction to an Aztec node to be broadcasted to the network and mined.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `tx` | `Tx` | The transaction as created via `proveTx`. |

#### Returns

`Promise`\<`TxHash`\>

A hash of the transaction, used to identify it.

___

### simulateTx

▸ **simulateTx**(`txRequest`, `simulatePublic`, `skipTxValidation?`, `skipFeeEnforcement?`, `overrides?`, `scopes?`): `Promise`\<`TxSimulationResult`\>

Simulates a transaction based on the provided preauthenticated execution request.
This will run a local simulation of private execution (and optionally of public as well), run the
kernel circuits to ensure adherence to protocol rules (without generating a proof), and return the
simulation results .

Note that this is used with `ContractFunctionInteraction::simulateTx` to bypass certain checks.
In that case, the transaction returned is only potentially ready to be sent to the network for execution.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `txRequest` | `TxExecutionRequest` | An authenticated tx request ready for simulation |
| `simulatePublic` | `boolean` | Whether to simulate the public part of the transaction. |
| `skipTxValidation?` | `boolean` | (Optional) If false, this function throws if the transaction is unable to be included in a block at the current state. |
| `skipFeeEnforcement?` | `boolean` | (Optional) If false, fees are enforced. |
| `overrides?` | `SimulationOverrides` | (Optional) State overrides for the simulation, such as msgSender, contract instances and artifacts. |
| `scopes?` | `AztecAddress`[] | (Optional) The accounts whose notes we can access in this call. Currently optional and will default to all. |

#### Returns

`Promise`\<`TxSimulationResult`\>

A simulated transaction result object that includes public and private return values.

**`Throws`**

If the code for the functions executed in this transaction have not been made available via `addContracts`.
Also throws if simulatePublic is true and public simulation reverts.

___

### simulateUtility

▸ **simulateUtility**(`functionName`, `args`, `to`, `authwits?`, `from?`, `scopes?`): `Promise`\<`UtilitySimulationResult`\>

Simulate the execution of a contract utility function.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `functionName` | `string` | The name of the utility contract function to be called. |
| `args` | `any`[] | The arguments to be provided to the function. |
| `to` | `AztecAddress` | The address of the contract to be called. |
| `authwits?` | `AuthWitness`[] | (Optional) The authentication witnesses required for the function call. |
| `from?` | `AztecAddress` | (Optional) The msg sender to set for the call. |
| `scopes?` | `AztecAddress`[] | (Optional) The accounts whose notes we can access in this call. Currently optional and will default to all. |

#### Returns

`Promise`\<`UtilitySimulationResult`\>

The result of the utility function call, structured based on the function ABI.

___

### updateContract

▸ **updateContract**(`contractAddress`, `artifact`): `Promise`\<`void`\>

Updates a deployed contract in the PXE Service. This is used to update the contract artifact when
an update has happened, so the new code can be used in the simulation of local transactions.
This is called by aztec.js when instantiating a contract in a given address with a mismatching artifact.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `contractAddress` | `AztecAddress` | The address of the contract to update. |
| `artifact` | `ContractArtifact` | The updated artifact for the contract. |

#### Returns

`Promise`\<`void`\>
