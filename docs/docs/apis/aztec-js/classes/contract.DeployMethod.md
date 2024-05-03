---
id: "contract.DeployMethod"
title: "Class: DeployMethod<TContract>"
sidebar_label: "DeployMethod"
custom_edit_url: null
---

[contract](../modules/contract.md).DeployMethod

Contract interaction for deployment. Handles class registration, public instance deployment,
and initialization of the contract. Extends the BaseContractInteraction class.

## Type parameters

| Name | Type |
| :------ | :------ |
| `TContract` | extends [`ContractBase`](contract.ContractBase.md) = [`Contract`](contract.Contract.md) |

## Hierarchy

- `BaseContractInteraction`

  ↳ **`DeployMethod`**

## Constructors

### constructor

• **new DeployMethod**\<`TContract`\>(`publicKeysHash`, `wallet`, `artifact`, `postDeployCtor`, `args?`, `constructorNameOrArtifact?`): [`DeployMethod`](contract.DeployMethod.md)\<`TContract`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `TContract` | extends [`ContractBase`](contract.ContractBase.md) = [`Contract`](contract.Contract.md) |

#### Parameters

| Name | Type | Default value |
| :------ | :------ | :------ |
| `publicKeysHash` | `Fr` | `undefined` |
| `wallet` | [`Wallet`](../modules/account.md#wallet) | `undefined` |
| `artifact` | `ContractArtifact` | `undefined` |
| `postDeployCtor` | (`address`: `AztecAddress`, `wallet`: [`Wallet`](../modules/account.md#wallet)) => `Promise`\<`TContract`\> | `undefined` |
| `args` | `any`[] | `[]` |
| `constructorNameOrArtifact?` | `string` \| `FunctionArtifact` | `undefined` |

#### Returns

[`DeployMethod`](contract.DeployMethod.md)\<`TContract`\>

#### Overrides

BaseContractInteraction.constructor

## Properties

### args

• `Private` **args**: `any`[] = `[]`

___

### artifact

• `Private` **artifact**: `ContractArtifact`

___

### constructorArtifact

• `Private` **constructorArtifact**: `undefined` \| `FunctionArtifact`

Constructor function to call.

___

### functionCalls

• `Private` `Optional` **functionCalls**: `ExecutionRequestInit`

Cached call to request()

___

### instance

• `Private` `Optional` **instance**: `ContractInstanceWithAddress` = `undefined`

The contract instance to be deployed.

___

### log

• `Private` **log**: `Logger`

___

### postDeployCtor

• `Private` **postDeployCtor**: (`address`: `AztecAddress`, `wallet`: [`Wallet`](../modules/account.md#wallet)) => `Promise`\<`TContract`\>

#### Type declaration

▸ (`address`, `wallet`): `Promise`\<`TContract`\>

##### Parameters

| Name | Type |
| :------ | :------ |
| `address` | `AztecAddress` |
| `wallet` | [`Wallet`](../modules/account.md#wallet) |

##### Returns

`Promise`\<`TContract`\>

___

### publicKeysHash

• `Private` **publicKeysHash**: `Fr`

___

### pxe

• `Protected` **pxe**: `PXE`

#### Inherited from

BaseContractInteraction.pxe

___

### tx

• `Protected` `Optional` **tx**: `Tx`

#### Inherited from

BaseContractInteraction.tx

___

### txRequest

• `Protected` `Optional` **txRequest**: `TxExecutionRequest`

#### Inherited from

BaseContractInteraction.txRequest

___

### wallet

• `Protected` **wallet**: [`Wallet`](../modules/account.md#wallet)

## Accessors

### address

• `get` **address**(): `undefined` \| `AztecAddress`

Return this deployment address.

#### Returns

`undefined` \| `AztecAddress`

___

### partialAddress

• `get` **partialAddress**(): `undefined` \| `Fr`

Returns the partial address for this deployment.

#### Returns

`undefined` \| `Fr`

## Methods

### create

▸ **create**(`options?`): `Promise`\<`TxExecutionRequest`\>

Create a contract deployment transaction, given the deployment options.
This function internally calls `request()` and `sign()` methods to prepare
the transaction for deployment. The resulting signed transaction can be
later sent using the `send()` method.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `options` | [`DeployOptions`](../modules/contract.md#deployoptions) | An object containing optional deployment settings, contractAddressSalt, and from. |

#### Returns

`Promise`\<`TxExecutionRequest`\>

A Promise resolving to an object containing the signed transaction data and other relevant information.

#### Overrides

BaseContractInteraction.create

___

### getDeploymentFunctionCalls

▸ **getDeploymentFunctionCalls**(`options?`): `Promise`\<`ExecutionRequestInit`\>

Returns calls for registration of the class and deployment of the instance, depending on the provided options.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `options` | [`DeployOptions`](../modules/contract.md#deployoptions) | Deployment options. |

#### Returns

`Promise`\<`ExecutionRequestInit`\>

A function call array with potentially requests to the class registerer and instance deployer.

___

### getInitializeFunctionCalls

▸ **getInitializeFunctionCalls**(`options`): `Promise`\<`ExecutionRequestInit`\>

Returns the calls necessary to initialize the contract.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `options` | [`DeployOptions`](../modules/contract.md#deployoptions) | Deployment options. |

#### Returns

`Promise`\<`ExecutionRequestInit`\>

- An array of function calls.

___

### getInstance

▸ **getInstance**(`options?`): `ContractInstanceWithAddress`

Builds the contract instance to be deployed and returns it.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `options` | [`DeployOptions`](../modules/contract.md#deployoptions) | An object containing various deployment options. |

#### Returns

`ContractInstanceWithAddress`

An instance object.

___

### prove

▸ **prove**(`options`): `Promise`\<`Tx`\>

Prove the request.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `options` | [`DeployOptions`](../modules/contract.md#deployoptions) | Deployment options. |

#### Returns

`Promise`\<`Tx`\>

The proven tx.

#### Overrides

BaseContractInteraction.prove

___

### request

▸ **request**(`options?`): `Promise`\<`ExecutionRequestInit`\>

Returns an array of function calls that represent this operation. Useful as a building
block for constructing batch requests.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `options` | [`DeployOptions`](../modules/contract.md#deployoptions) | Deployment options. |

#### Returns

`Promise`\<`ExecutionRequestInit`\>

An array of function calls.

**`Remarks`**

This method does not have the same return type as the `request` in the ContractInteraction object,
it returns a promise for an array instead of a function call directly.

___

### send

▸ **send**(`options?`): [`DeploySentTx`](contract.DeploySentTx.md)\<`TContract`\>

Send the contract deployment transaction using the provided options.
This function extends the 'send' method from the ContractFunctionInteraction class,
allowing us to send a transaction specifically for contract deployment.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `options` | [`DeployOptions`](../modules/contract.md#deployoptions) | An object containing various deployment options such as contractAddressSalt and from. |

#### Returns

[`DeploySentTx`](contract.DeploySentTx.md)\<`TContract`\>

A SentTx object that returns the receipt and the deployed contract instance.

#### Overrides

BaseContractInteraction.send
