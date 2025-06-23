---
title: Contract Interaction
---

In this section, we'll write the logic in our app that will interact with the contract we have previously deployed. We'll be using the accounts already seeded in the Sandbox.

## Showing user balance

Let's start by showing our user's private balance for the token across their accounts. To do this, we can leverage the `balance_of_private` utility function of the token contract:

```rust title="balance_of_private" showLineNumbers 
#[utility]
pub(crate) unconstrained fn balance_of_private(owner: AztecAddress) -> u128 {
    storage.balances.at(owner).balance_of()
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L720-L725" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L720-L725</a></sub></sup>


:::info
Note that this function will only return a valid response for accounts registered in the Private eXecution Environment (PXE), since it requires access to the [user's private state](../../../../../aztec/concepts/wallets/index.md#private-state). In other words, you cannot query the private balance of another user for the token contract.
:::

To do this, let's first initialize a new `Contract` instance using `aztec.js` that represents our deployed token contracts. Create a new `src/contracts.mjs` file with the imports for our artifacts and other dependencies:

```js
// src/contracts.mjs
import { AztecAddress, Contract, loadContractArtifact } from "@aztec/aztec.js";
import TokenContractJson from "../contracts/token/target/token-Token.json" with { type: "json" };

import { readFileSync } from "fs";
const TokenContractArtifact = loadContractArtifact(TokenContractJson);

export async function getToken(wallet) {
  const addresses = JSON.parse(readFileSync('addresses.json'));
  return Contract.at(AztecAddress.fromString(addresses.token), TokenContractArtifact, wallet);
}
```

We can now get the token instance in our main code in `src/index.mjs`, by importing the function from `src/contracts.mjs`. Update the imports in `src/index.mjs` to look like this:

```js
// src/index.mjs
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { createPXEClient, waitForPXE } from '@aztec/aztec.js';
import { fileURLToPath } from '@aztec/foundation/url';

import { getToken } from './contracts.mjs';
```

and query the private balance for each of the user accounts. To query a function, without sending a transaction, use the `simulate` function of the method:

```javascript title="showPrivateBalances" showLineNumbers 
async function showPrivateBalances(pxe) {
  const [owner] = await getInitialTestAccountsWallets(pxe);
  const token = await getToken(owner);

  const accounts = await pxe.getRegisteredAccounts();

  for (const account of accounts) {
    // highlight-next-line
    const balance = await token.methods.balance_of_private(account.address).simulate();
    console.log(`Balance of ${account.address}: ${balance}`);
  }
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/end-to-end/src/sample-dapp/index.mjs#L19-L32" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/sample-dapp/index.mjs#L19-L32</a></sub></sup>


Call the function in `main` and run this with `node src/index.mjs` and you should now see the following output:

```
Balance of 0x0c8a6673d7676cc80aaebe7fa7504cf51daa90ba906861bfad70a58a98bf5a7d: 0
Balance of 0x226f8087792beff8d5009eb94e65d2a4a505b70baf4a9f28d33c8d620b0ba972: 0
Balance of 0x0e1f60e8566e2c6d32378bdcadb7c63696e853281be798c107266b8c3a88ea9b: 0
```

## Mint tokens

Before we can transfer tokens, we need to mint some tokens to our user accounts. Add the following function to `src/index.mjs`:

```javascript title="mintPrivateFunds" showLineNumbers 
async function mintPrivateFunds(pxe) {
  const [ownerWallet] = await getInitialTestAccountsWallets(pxe);
  const token = await getToken(ownerWallet);

  await showPrivateBalances(pxe);

  // We mint tokens to the owner
  const mintAmount = 20n;
  const from = ownerWallet.getAddress(); // we are setting from to owner here because we need a sender to calculate the tag
  await token.methods.mint_to_private(from, ownerWallet.getAddress(), mintAmount).send().wait();

  await showPrivateBalances(pxe);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/end-to-end/src/sample-dapp/index.mjs#L34-L48" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/sample-dapp/index.mjs#L34-L48</a></sub></sup>


Call the function in `main`, run the script and after printing the balances of each account it will then privately mint tokens. After that completes, you should then see 20 tokens in the balance of the first account.

```text
Balance of 0x0c8a6673d7676cc80aaebe7fa7504cf51daa90ba906861bfad70a58a98bf5a7d: 20
Balance of 0x226f8087792beff8d5009eb94e65d2a4a505b70baf4a9f28d33c8d620b0ba972: 0
Balance of 0x0e1f60e8566e2c6d32378bdcadb7c63696e853281be798c107266b8c3a88ea9b: 0
```

## Transferring private tokens

Now that we can see the balance for each user, let's transfer tokens from one account to another. To do this, we will first need access to a `Wallet` object. This wraps access to an PXE and also provides an interface to craft and sign transactions on behalf of one of the user accounts.

For ease of use, `@aztec/accounts` also ships with a helper `getInitialTestAccountsWallets` method that returns a wallet for each of the pre-initialized accounts in the Sandbox, so you can send transactions as any of them. Import it in `index.mjs`.

```js
import { getInitialTestAccountsWallets } from "@aztec/accounts/testing";
```

We'll use one of these wallets to initialize the `TokenContract` instance that represents our private token contract, so every transaction sent through it will be sent through that wallet.

```javascript title="transferPrivateFunds" showLineNumbers 
async function transferPrivateFunds(pxe) {
  const [owner, recipient] = await getInitialTestAccountsWallets(pxe);
  const token = await getToken(owner);

  await showPrivateBalances(pxe);
  console.log(`Sending transaction, awaiting transaction to be mined`);
  const receipt = await token.methods.transfer(recipient.getAddress(), 1).send().wait();

  console.log(`Transaction ${receipt.txHash} has been mined on block ${receipt.blockNumber}`);
  await showPrivateBalances(pxe);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/end-to-end/src/sample-dapp/index.mjs#L50-L62" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/sample-dapp/index.mjs#L50-L62</a></sub></sup>


Let's go step-by-step on this snippet. We first get wallets for two of the Sandbox accounts, and name them `owner` and `recipient`. Then, we initialize the private token `Contract` instance using the `owner` wallet, meaning that any transactions sent through it will have the `owner` as sender.

Next, we send a transfer transaction, moving 1 unit of balance to the `recipient` account address. This has no immediate effect, since the transaction first needs to be simulated locally and then submitted and mined. Only once this has finished we can query the balances again and see the effect of our transaction. We are using a `showPrivateBalances` helper function here which has the code we wrote in the section above.

Run this new snippet and you should see the following:

```text
Sent transfer transaction 16025a7c4f6c44611d7ac884a5c27037d85d9756a4924df6d97fb25f6e83a0c8

Balance of 0x0c8a6673d7676cc80aaebe7fa7504cf51daa90ba906861bfad70a58a98bf5a7d: 20
Balance of 0x226f8087792beff8d5009eb94e65d2a4a505b70baf4a9f28d33c8d620b0ba972: 0
Balance of 0x0e1f60e8566e2c6d32378bdcadb7c63696e853281be798c107266b8c3a88ea9b: 0

Awaiting transaction to be mined
Transaction has been mined on block 4

Balance of 0x0c8a6673d7676cc80aaebe7fa7504cf51daa90ba906861bfad70a58a98bf5a7d: 19
Balance of 0x226f8087792beff8d5009eb94e65d2a4a505b70baf4a9f28d33c8d620b0ba972: 1
Balance of 0x0e1f60e8566e2c6d32378bdcadb7c63696e853281be798c107266b8c3a88ea9b: 0
```

:::info
At the time of this writing, there are no events emitted when new private notes are received, so the only way to detect of a change in a user's private balance is via polling on every new block processed. This will change in a future release.
:::

## Working with public state

While [private and public state](../../../../../aztec/concepts/storage/index.md) are fundamentally different, the API for working with private and public functions and state from `aztec.js` is equivalent. To query the balance in public tokens for our user accounts, we can just call the `balance_of_public` view function in the contract:

```javascript title="showPublicBalances" showLineNumbers 
async function showPublicBalances(pxe) {
  const [owner] = await getInitialTestAccountsWallets(pxe);
  const token = await getToken(owner);

  const accounts = await pxe.getRegisteredAccounts();

  for (const account of accounts) {
    // highlight-next-line
    const balance = await token.methods.balance_of_public(account.address).simulate();
    console.log(`Balance of ${account.address}: ${balance}`);
  }
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/end-to-end/src/sample-dapp/index.mjs#L64-L77" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/sample-dapp/index.mjs#L64-L77</a></sub></sup>


:::info
Since this we are working with public balances, we can now query the balance for any address, not just those registered in our local PXE. We can also send funds to addresses for which we don't know their [public encryption key](../../../../../aztec/concepts/accounts/keys.md#keys-generation).
:::

Here, since the token contract does not mint any initial funds upon deployment, the balances for all of our user's accounts will be zero.
But we can send a transaction to mint tokens, using very similar code to the one for sending private funds:

```javascript title="mintPublicFunds" showLineNumbers 
async function mintPublicFunds(pxe) {
  const [owner] = await getInitialTestAccountsWallets(pxe);
  const token = await getToken(owner);

  await showPublicBalances(pxe);

  console.log(`Sending transaction, awaiting transaction to be mined`);
  const receipt = await token.methods.mint_to_public(owner.getAddress(), 100).send().wait();
  console.log(`Transaction ${receipt.txHash} has been mined on block ${receipt.blockNumber}`);

  await showPublicBalances(pxe);

  const blockNumber = await pxe.getBlockNumber();
  const logs = (await pxe.getPublicLogs({ fromBlock: blockNumber - 1 })).logs;
  const textLogs = logs.map(extendedLog => extendedLog.toHumanReadable().slice(0, 200));
  for (const log of textLogs) console.log(`Log emitted: ${log}`);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/end-to-end/src/sample-dapp/index.mjs#L79-L99" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/sample-dapp/index.mjs#L79-L99</a></sub></sup>


And get the expected results:

```text
Sent mint transaction 041d5b4cc68bcb5c6cb45cd4c79f893d94f0df0792f66e6fddd7718c049fe925
Balance of 0x0c8a6673d7676cc80aaebe7fa7504cf51daa90ba906861bfad70a58a98bf5a7d: 0
Balance of 0x226f8087792beff8d5009eb94e65d2a4a505b70baf4a9f28d33c8d620b0ba972: 0
Balance of 0x0e1f60e8566e2c6d32378bdcadb7c63696e853281be798c107266b8c3a88ea9b: 0

Awaiting transaction to be mined
Transaction has been mined on block 5

Balance of 0x0c8a6673d7676cc80aaebe7fa7504cf51daa90ba906861bfad70a58a98bf5a7d: 100
Balance of 0x226f8087792beff8d5009eb94e65d2a4a505b70baf4a9f28d33c8d620b0ba972: 0
Balance of 0x0e1f60e8566e2c6d32378bdcadb7c63696e853281be798c107266b8c3a88ea9b: 0
```

## Next steps

In the next and final section, we'll [set up automated tests for our application](./4_testing.md).
