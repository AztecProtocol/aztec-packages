---
title: How to use authentication witnesses (authwit)
tags: [accounts, authwit]
sidebar_position: 5
description: Learn how to use authentication witnesses in your Aztec.js applications for secure, delegated transactions.
---

This page assumes you have authwit set up correctly in your contract. To learn how to do that, [go here](../smart_contracts/authwit.md).

For an introduction to authentication witnesses on Aztec, [read this explainer](../../concepts/advanced/authwit.md).

## Import libraries

These are all the libraries you might need for using authwits in Aztec.js:

```typescript
import {
  computeAuthWitMessageHash,
  computeInnerAuthWitHash,
} from "@aztec/aztec.js";
```

You may not need all of these.

## Publicly deploy accounts

:::note
This is only required if you are using authwits in public
:::

If you are using public authwit (ie using `assert_current_call_valid_authwit_public` in your contract), you will need to deploy the following accounts publicly:

1. The account that is giving permission to an account to act on behalf of it (authwit giver)
2. The account that does the action (authwit receiver)

Here is an example implementation:

```typescript title="public_deploy_accounts" showLineNumbers
export async function ensureAccountContractsPublished(sender: Wallet, accountsToDeploy: Wallet[]) {
  // We have to check whether the accounts are already deployed. This can happen if the test runs against
  // the sandbox and the test accounts exist
  const accountsAndAddresses = await Promise.all(
    accountsToDeploy.map(async account => {
      const address = account.getAddress();
      return {
        address,
        deployed: (await sender.getContractMetadata(address)).isContractPublished,
      };
    }),
  );
  const instances = (
    await Promise.all(
      accountsAndAddresses
        .filter(({ deployed }) => !deployed)
        .map(({ address }) => sender.getContractMetadata(address)),
    )
  ).map(contractMetadata => contractMetadata.contractInstance);
  const contractClass = await getContractClassFromArtifact(SchnorrAccountContractArtifact);
  if (!(await sender.getContractClassMetadata(contractClass.id, true)).isContractClassPubliclyRegistered) {
    await (await publishContractClass(sender, SchnorrAccountContractArtifact))
      .send({ from: accountsToDeploy[0].getAddress() })
      .wait();
  }
  const requests = await Promise.all(instances.map(async instance => await publishInstance(sender, instance!)));
  const batch = new BatchCall(sender, requests);
  await batch.send({ from: accountsToDeploy[0].getAddress() }).wait();
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/fixtures/utils.ts#L763-L793" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/fixtures/utils.ts#L763-L793</a></sub></sup>


You would then call this like so:

```typescript title="public_deploy_accounts" showLineNumbers
[account1, account2] = wallets;
[account1Address, account2Address] = accounts;
await ensureAccountContractsPublished(account1, wallets.slice(0, 2));
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/e2e_authwit.test.ts#L34-L38" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_authwit.test.ts#L34-L38</a></sub></sup>


## Define the action

When creating an authwit, you will need to pass the authwit giver, the authwit receiver (who will perform the action), and the action that is being authorized. The action can be a smart contract function call, or alternatively, arbitrary data.

### When the action is a function call

You can define the action like this:

```typescript title="authwit_computeAuthWitMessageHash" showLineNumbers
const action = asset.withWallet(other).methods.transfer(adminAddress, otherAddress, amount, authwitNonce);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/e2e_blacklist_token_contract/transfer_private.test.ts#L53-L55" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_blacklist_token_contract/transfer_private.test.ts#L53-L55</a></sub></sup>


In this example,

- `asset` refers to a token contract
- `withWallet(wallets[1])` is specifying the authwit receiver (`wallets[1]`) will do this action
- `.methods.transfer()` is specifying that the action is calling the `transfer` method on the token contract
- `(wallets[0].getAddress(), wallets[1].getAddress(), amount, nonce);` are the args of this method - it will send the `amount` from `wallets[0]` to `wallets[1]`

### Arbitrary message

You can hash your own authwit message by creating an inner hash with the data, like this:

```typescript title="compute_inner_authwit_hash" showLineNumbers
const innerHash = await computeInnerAuthWitHash([Fr.fromHexString('0xdead')]);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/e2e_authwit.test.ts#L57-L59" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_authwit.test.ts#L57-L59</a></sub></sup>


Then create the message hash by hashing the inner hash with the authwit receiver address, chainId, and version:

```typescript title="compute_arbitrary_authwit_hash" showLineNumbers

const intent = { consumer: auth.address, innerHash };
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/e2e_authwit.test.ts#L60-L63" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_authwit.test.ts#L60-L63</a></sub></sup>


## Create the authwit

There are slightly different interfaces depending on whether your contract is checking the authwit in private or public.

Public authwits are stored in the account contract and batched with the authwit action call, so a user must send a transaction to update their account contract, authorizing an action before the authorized contract's public call will succeed.

Private execution uses oracles and are executed locally by the PXE, so the authwit needs to be created by the authwit giver and then added to the authwit receiver's PXE.

### Private

This is expected to be used alongside [private authwits in Aztec.nr contract](../smart_contracts/authwit.md#private-functions).

Create a private authwit like this:

```typescript title="create_authwit" showLineNumbers
const witness = await admin.createAuthWit({ caller: otherAddress, action });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/e2e_blacklist_token_contract/transfer_private.test.ts#L56-L58" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_blacklist_token_contract/transfer_private.test.ts#L56-L58</a></sub></sup>


In this example,

- `wallets[0]` is the authwit giver
- `wallets[1]` is the authwit receiver and caller of the function
- `action` was [defined previously](#define-the-action)

If you created an arbitrary message, you can create the authwit by replacing these params with the outer hash:

```typescript title="compute_arbitrary_authwit_hash" showLineNumbers

const intent = { consumer: auth.address, innerHash };
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/e2e_authwit.test.ts#L60-L63" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_authwit.test.ts#L60-L63</a></sub></sup>


Then add it to the wallet of the authwit receiver (the caller of the function):

```typescript title="add_authwit" showLineNumbers
await action.send({ from: otherAddress, authWitnesses: [witness] }).wait();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/e2e_blacklist_token_contract/transfer_private.test.ts#L62-L64" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_blacklist_token_contract/transfer_private.test.ts#L62-L64</a></sub></sup>


### Public

This is expected to be used alongside [public authwits in Aztec.nr contract](../smart_contracts/authwit.md#public-functions).

Set a public authwit like this:

```typescript title="set_public_authwit" showLineNumbers
const validateActionInteraction = await admin.setPublicAuthWit({ caller: otherAddress, action }, true);
await validateActionInteraction.send({ from: adminAddress }).wait();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/e2e_blacklist_token_contract/transfer_public.test.ts#L118-L121" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_blacklist_token_contract/transfer_public.test.ts#L118-L121</a></sub></sup>


Remember it is a transaction and calls a method in the account contract. In this example,

- `wallets[0]` is the authwit giver
- `wallets[1]` is the authwit receiver and caller of the function
- `action` was [defined previously](#define-the-action)
- `true` sets the `authorized` boolean (`false` would revoke this authwit)

If you created an arbitrary message, you would replace the first param struct with the outer hash:

```typescript title="set_public_authwit" showLineNumbers
const validateActionInteraction = await account1.setPublicAuthWit(intent, true);
await validateActionInteraction.send({ from: account1Address }).wait();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v2.0.2/yarn-project/end-to-end/src/e2e_authwit.test.ts#L167-L170" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/e2e_authwit.test.ts#L167-L170</a></sub></sup>


## Further reading

- [An explainer of authentication witnesses](../../concepts/advanced/authwit.md)
- [Authwits in Aztec.nr](../smart_contracts/authwit.md)
