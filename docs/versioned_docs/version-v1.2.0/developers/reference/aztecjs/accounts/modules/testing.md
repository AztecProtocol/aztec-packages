---
id: "testing"
title: "Module: testing"
sidebar_label: "testing"
sidebar_position: 0
custom_edit_url: null
---

The `@aztec/accounts/testing` export provides utility methods for testing, in particular in a Sandbox environment.

Use [getInitialTestAccountsWallets](testing.md#getinitialtestaccountswallets) to obtain a list of wallets for the Sandbox pre-seeded accounts.

## Interfaces

- [InitialAccountData](../interfaces/testing.InitialAccountData.md)

## Variables

### INITIAL\_TEST\_ACCOUNT\_SALTS

• `Const` **INITIAL\_TEST\_ACCOUNT\_SALTS**: `Fr`[]

___

### INITIAL\_TEST\_ENCRYPTION\_KEYS

• `Const` **INITIAL\_TEST\_ENCRYPTION\_KEYS**: `Fq`[]

___

### INITIAL\_TEST\_SECRET\_KEYS

• `Const` **INITIAL\_TEST\_SECRET\_KEYS**: `Fr`[]

___

### INITIAL\_TEST\_SIGNING\_KEYS

• `Const` **INITIAL\_TEST\_SIGNING\_KEYS**: `Fq`[] = `INITIAL_TEST_ENCRYPTION_KEYS`

## Functions

### deployFundedSchnorrAccount

▸ **deployFundedSchnorrAccount**(`pxe`, `account`, `opts?`, `waitForProvenOptions?`): `Promise`\<`AccountManager`\>

Deploy schnorr account contract.
It will pay for the fee for the deployment itself. So it must be funded with the prefilled public data.

#### Parameters

| Name | Type |
| :------ | :------ |
| `pxe` | `PXE` |
| `account` | `DeployAccountData` |
| `opts` | `WaitOpts` & \{ `skipClassRegistration?`: `boolean`  } |
| `waitForProvenOptions?` | `WaitForProvenOpts` |

#### Returns

`Promise`\<`AccountManager`\>

___

### deployFundedSchnorrAccounts

▸ **deployFundedSchnorrAccounts**(`pxe`, `accounts`, `opts?`, `waitForProvenOptions?`): `Promise`\<`AccountManager`[]\>

Deploy schnorr account contracts.
They will pay for the fees for the deployment themselves. So they must be funded with the prefilled public data.

#### Parameters

| Name | Type |
| :------ | :------ |
| `pxe` | `PXE` |
| `accounts` | `DeployAccountData`[] |
| `opts` | `WaitOpts` & \{ `skipClassRegistration?`: `boolean`  } |
| `waitForProvenOptions?` | `WaitForProvenOpts` |

#### Returns

`Promise`\<`AccountManager`[]\>

___

### generateSchnorrAccounts

▸ **generateSchnorrAccounts**(`numberOfAccounts`): `Promise`\<\{ `address`: `AztecAddress` ; `salt`: `Fr` ; `secret`: `Fr` ; `signingKey`: `Fq`  }[]\>

Generate a fixed amount of random schnorr account contract instance.

#### Parameters

| Name | Type |
| :------ | :------ |
| `numberOfAccounts` | `number` |

#### Returns

`Promise`\<\{ `address`: `AztecAddress` ; `salt`: `Fr` ; `secret`: `Fr` ; `signingKey`: `Fq`  }[]\>

___

### getDeployedTestAccounts

▸ **getDeployedTestAccounts**(`pxe`): `Promise`\<[`InitialAccountData`](../interfaces/testing.InitialAccountData.md)[]\>

Queries a PXE for it's registered accounts.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `pxe` | `PXE` | PXE instance. |

#### Returns

`Promise`\<[`InitialAccountData`](../interfaces/testing.InitialAccountData.md)[]\>

A set of key data for each of the initial accounts.

___

### getDeployedTestAccountsWallets

▸ **getDeployedTestAccountsWallets**(`pxe`): `Promise`\<`AccountWalletWithSecretKey`[]\>

Queries a PXE for it's registered accounts and returns wallets for those accounts using keys in the initial test accounts.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `pxe` | `PXE` | PXE instance. |

#### Returns

`Promise`\<`AccountWalletWithSecretKey`[]\>

A set of AccountWallet implementations for each of the initial accounts.

___

### getInitialTestAccounts

▸ **getInitialTestAccounts**(): `Promise`\<[`InitialAccountData`](../interfaces/testing.InitialAccountData.md)[]\>

Gets the basic information for initial test accounts.

#### Returns

`Promise`\<[`InitialAccountData`](../interfaces/testing.InitialAccountData.md)[]\>

___

### getInitialTestAccountsManagers

▸ **getInitialTestAccountsManagers**(`pxe`): `Promise`\<`AccountManager`[]\>

Gets a collection of account managers for the Aztec accounts that are initially stored in the test environment.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `pxe` | `PXE` | PXE instance. |

#### Returns

`Promise`\<`AccountManager`[]\>

A set of AccountManager implementations for each of the initial accounts.

___

### getInitialTestAccountsWallets

▸ **getInitialTestAccountsWallets**(`pxe`): `Promise`\<`AccountWalletWithSecretKey`[]\>

Gets a collection of wallets for the Aztec accounts that are initially stored in the test environment.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `pxe` | `PXE` | PXE instance. |

#### Returns

`Promise`\<`AccountWalletWithSecretKey`[]\>

A set of AccountWallet implementations for each of the initial accounts.
