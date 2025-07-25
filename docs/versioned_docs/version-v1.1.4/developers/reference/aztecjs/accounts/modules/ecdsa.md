---
id: "ecdsa"
title: "Module: ecdsa"
sidebar_label: "ecdsa"
sidebar_position: 0
custom_edit_url: null
---

## Classes

- [EcdsaKAccountContract](../classes/ecdsa.EcdsaKAccountContract.md)
- [EcdsaRAccountContract](../classes/ecdsa.EcdsaRAccountContract.md)
- [EcdsaRSSHAccountContract](../classes/ecdsa.EcdsaRSSHAccountContract.md)

## Variables

### EcdsaKAccountContractArtifact

• `Const` **EcdsaKAccountContractArtifact**: `ContractArtifact`

___

### EcdsaRAccountContractArtifact

• `Const` **EcdsaRAccountContractArtifact**: `ContractArtifact`

## Functions

### getEcdsaKAccount

▸ **getEcdsaKAccount**(`pxe`, `secretKey`, `signingPrivateKey`, `salt?`): `Promise`\<`AccountManager`\>

Creates an Account that relies on an ECDSA signing key for authentication.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `pxe` | `PXE` | An PXE server instance. |
| `secretKey` | `Fr` | Secret key used to derive all the keystore keys. |
| `signingPrivateKey` | `Buffer`\<`ArrayBufferLike`\> | Secp256k1 key used for signing transactions. |
| `salt?` | `Salt` | Deployment salt. |

#### Returns

`Promise`\<`AccountManager`\>

An account manager initialized with the account contract and its deployment params

___

### getEcdsaKWallet

▸ **getEcdsaKWallet**(`pxe`, `address`, `signingPrivateKey`): `Promise`\<`AccountWallet`\>

Gets a wallet for an already registered account using ECDSA signatures.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `pxe` | `PXE` | An PXE server instance. |
| `address` | `AztecAddress` | Address for the account. |
| `signingPrivateKey` | `Buffer`\<`ArrayBufferLike`\> | ECDSA key used for signing transactions. |

#### Returns

`Promise`\<`AccountWallet`\>

A wallet for this account that can be used to interact with a contract instance.

___

### getEcdsaRAccount

▸ **getEcdsaRAccount**(`pxe`, `secretKey`, `signingPrivateKey`, `salt?`): `Promise`\<`AccountManager`\>

Creates an Account that relies on an ECDSA signing key for authentication.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `pxe` | `PXE` | An PXE server instance. |
| `secretKey` | `Fr` | Secret key used to derive all the keystore keys. |
| `signingPrivateKey` | `Buffer`\<`ArrayBufferLike`\> | Secp256k1 key used for signing transactions. |
| `salt?` | `Salt` | Deployment salt. |

#### Returns

`Promise`\<`AccountManager`\>

An account manager initialized with the account contract and its deployment params

___

### getEcdsaRSSHAccount

▸ **getEcdsaRSSHAccount**(`pxe`, `secretKey`, `signingPublicKey`, `salt?`): `Promise`\<`AccountManager`\>

Creates an Account that relies on an ECDSA signing key for authentication.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `pxe` | `PXE` | An PXE server instance. |
| `secretKey` | `Fr` | Secret key used to derive all the keystore keys. |
| `signingPublicKey` | `Buffer`\<`ArrayBufferLike`\> | Secp2561 key used to identify its corresponding private key in the SSH Agent. |
| `salt?` | `Salt` | Deployment salt. |

#### Returns

`Promise`\<`AccountManager`\>

An account manager initialized with the account contract and its deployment params

___

### getEcdsaRSSHWallet

▸ **getEcdsaRSSHWallet**(`pxe`, `address`, `signingPublicKey`): `Promise`\<`AccountWallet`\>

Gets a wallet for an already registered account using ECDSA signatures.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `pxe` | `PXE` | An PXE server instance. |
| `address` | `AztecAddress` | Address for the account. |
| `signingPublicKey` | `Buffer`\<`ArrayBufferLike`\> | - |

#### Returns

`Promise`\<`AccountWallet`\>

A wallet for this account that can be used to interact with a contract instance.

___

### getEcdsaRWallet

▸ **getEcdsaRWallet**(`pxe`, `address`, `signingPrivateKey`): `Promise`\<`AccountWallet`\>

Gets a wallet for an already registered account using ECDSA signatures.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `pxe` | `PXE` | An PXE server instance. |
| `address` | `AztecAddress` | Address for the account. |
| `signingPrivateKey` | `Buffer`\<`ArrayBufferLike`\> | ECDSA key used for signing transactions. |

#### Returns

`Promise`\<`AccountWallet`\>

A wallet for this account that can be used to interact with a contract instance.
