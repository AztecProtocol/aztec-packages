---
title: Contract Interaction
---

In this section, we'll write the logic in our app that will interact with the contract we have previously deployed. We'll be using the accounts already seeded in the Sandbox.

## Showing user balance

Let's start by showing our user's private balance for the token across their accounts. To do this, we can leverage the `balance_of_private` unconstrained view function of the token contract:

#include_code balance_of_private noir-projects/noir-contracts/contracts/token_contract/src/main.nr rust

:::info
Note that this function will only return a valid response for accounts registered in the Private eXecution Environment (PXE), since it requires access to the [user's private state](../../../../aztec/concepts/wallets/index.md#private-state). In other words, you cannot query the private balance of another user for the token contract.
:::

To do this, let's first initialize a new `Contract` instance using `aztec.js` that represents our deployed token contracts. Create a new `src/contracts.mjs` file with the imports for our artifacts and other dependencies:

```js
// src/contracts.mjs
#include_code imports yarn-project/end-to-end/src/sample-dapp/contracts.mjs raw
```

You may have noticed that we are importing the `TokenContract` class from `@aztec/noir-contracts.js`. This is an alternative way to get the contract interface for interacting with the contract. With this, we can add the following code for initializing the `TokenContract` instance:

#include_code get-tokens yarn-project/end-to-end/src/sample-dapp/contracts.mjs javascript

We can now get the token instance in our main code in `src/index.mjs`, by importing the function from `src/contracts.mjs`. Update the imports in `src/index.mjs` to look like this:

```js
// src/index.mjs
#include_code imports yarn-project/end-to-end/src/sample-dapp/index.mjs raw
```

and query the private balance for each of the user accounts. To query a function, without sending a transaction, use the `simulate` function of the method:

#include_code showPrivateBalances yarn-project/end-to-end/src/sample-dapp/index.mjs javascript

Call the function in `main` and run this with `node src/index.mjs` and you should now see the following output:

```
Balance of 0x0c8a6673d7676cc80aaebe7fa7504cf51daa90ba906861bfad70a58a98bf5a7d: 0
Balance of 0x226f8087792beff8d5009eb94e65d2a4a505b70baf4a9f28d33c8d620b0ba972: 0
Balance of 0x0e1f60e8566e2c6d32378bdcadb7c63696e853281be798c107266b8c3a88ea9b: 0
```

## Mint tokens

Before we can transfer tokens, we need to mint some tokens to our user accounts. Add the following function to `src/index.mjs`:

#include_code mintPrivateFunds yarn-project/end-to-end/src/sample-dapp/index.mjs javascript

Call the function in `main`, run the script and after printing the balances of each account it will then privately mint tokens. After that completes, you should then see 20 tokens in the balance of the first account.

```text
Balance of 0x0c8a6673d7676cc80aaebe7fa7504cf51daa90ba906861bfad70a58a98bf5a7d: 20
Balance of 0x226f8087792beff8d5009eb94e65d2a4a505b70baf4a9f28d33c8d620b0ba972: 0
Balance of 0x0e1f60e8566e2c6d32378bdcadb7c63696e853281be798c107266b8c3a88ea9b: 0
```

## Transferring private tokens

Now that we can see the balance for each user, let's transfer tokens from one account to another. To do this, we will first need access to a `Wallet` object. This wraps access to an PXE and also provides an interface to craft and sign transactions on behalf of one of the user accounts.

For ease of use, `@aztec/accounts` also ships with a helper `getInitialTestAccountsWallets` method that returns a wallet for each of the pre-initialized accounts in the Sandbox, so you can send transactions as any of them.

```js
import { getInitialTestAccountsWallets } from "@aztec/accounts/testing";
```

We'll use one of these wallets to initialize the `TokenContract` instance that represents our private token contract, so every transaction sent through it will be sent through that wallet.

#include_code transferPrivateFunds yarn-project/end-to-end/src/sample-dapp/index.mjs javascript

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

While [private and public state](../../../../aztec/concepts/storage/state_model/index.md) are fundamentally different, the API for working with private and public functions and state from `aztec.js` is equivalent. To query the balance in public tokens for our user accounts, we can just call the `balance_of_public` view function in the contract:

#include_code showPublicBalances yarn-project/end-to-end/src/sample-dapp/index.mjs javascript

:::info
Since this we are working with public balances, we can now query the balance for any address, not just those registered in our local PXE. We can also send funds to addresses for which we don't know their [public encryption key](../../../../aztec/concepts/accounts/keys.md#encryption-keys).
:::

Here, since the token contract does not mint any initial funds upon deployment, the balances for all of our user's accounts will be zero.
But we can send a transaction to mint tokens, using very similar code to the one for sending private funds:

#include_code mintPublicFunds yarn-project/end-to-end/src/sample-dapp/index.mjs javascript

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
