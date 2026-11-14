---
title: Using Multiple Wallets
tags: [accounts, wallets, notes, pxe]
sidebar_position: 9
description: Run two wallets with separate PXEs in one script, and register senders and contracts so each wallet can see the other's notes.
references: ["docs/lines/v6/examples/ts/aztecjs_multiple_wallets/index.ts", "labs/yarn-project/wallets/src/embedded/embedded_wallet.ts", "labs/yarn-project/aztec.js/src/wallet/wallet.ts"]
---

This guide shows you how to run two wallets in one script, for example to test an app with two users. Each wallet has its own PXE (Private eXecution Environment), so it starts with no knowledge of the other wallet's accounts, contracts or notes. You give it that knowledge with `registerSender` and `registerContract`.

import { General } from '@site/src/components/Snippets/general_snippets';

## Prerequisites

- <General.AztecJSPrerequisites />

## Create two wallets

Create one `EmbeddedWallet` per user. Each one runs its own PXE with its own key store and note database:

```typescript title="create_wallets" showLineNumbers 
import { createAztecNodeClient, waitForNode } from "@aztec-labs/aztec.js/node";
import { EmbeddedWallet } from "@aztec-labs/wallets/embedded";

const nodeUrl = process.env.AZTEC_NODE_URL ?? "http://localhost:8080";
const node = createAztecNodeClient(nodeUrl);
await waitForNode(node);

// Each wallet runs its own PXE, with its own keys, notes and registered contracts.
const aliceWallet = await EmbeddedWallet.create(node, { ephemeral: true });
const bobWallet = await EmbeddedWallet.create(node, { ephemeral: true });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/ts/aztecjs_multiple_wallets/index.ts#L1-L12" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/ts/aztecjs_multiple_wallets/index.ts#L1-L12</a></sub></sup>


Then add one account to each wallet. This example uses the local network's funded test accounts, so neither account needs to be deployed:

```typescript title="load_accounts" showLineNumbers 
import { getInitialTestAccountsData } from "@aztec-labs/accounts/testing";

const [aliceData, bobData] = await getInitialTestAccountsData();
const alice = await aliceWallet.createSchnorrInitializerlessAccount(
  aliceData.secret,
  aliceData.salt,
  aliceData.signingKey,
);
const bob = await bobWallet.createSchnorrInitializerlessAccount(
  bobData.secret,
  bobData.salt,
  bobData.signingKey,
);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/ts/aztecjs_multiple_wallets/index.ts#L14-L28" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/ts/aztecjs_multiple_wallets/index.ts#L14-L28</a></sub></sup>


On another network, create and deploy each account in its own wallet as shown in [Creating Accounts](./how_to_create_account.md).

## Register the sender

A recipient's PXE finds its notes by computing tags from a secret it shares with each sender it knows (see [Note discovery](../foundational-topics/advanced/storage/note_discovery.md#registering-known-senders)). A wallet treats its own accounts as known senders, but Bob's wallet has never heard of Alice. Register her before you expect notes from her:

```typescript title="register_sender" showLineNumbers 
await bobWallet.registerSender(alice.address, "alice");
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/ts/aztecjs_multiple_wallets/index.ts#L30-L32" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/ts/aztecjs_multiple_wallets/index.ts#L30-L32</a></sub></sup>


Without this call, Bob's private balance reads as zero even after Alice sends him tokens.

## Send private and public tokens

Alice deploys a token from her wallet and mints to Bob, once privately and once publicly. Her wallet does not need Bob's account: it encrypts the private note to Bob's address.

```typescript title="deploy_and_mint" showLineNumbers 
import { TokenContract } from "@aztec-labs/noir-contracts.js/Token";

const { contract: aliceToken } = await TokenContract.deploy(
  aliceWallet,
  alice.address,
  "TokenName",
  "TKN",
  18,
).send({ from: alice.address });

await aliceToken.methods
  .mint_to_private(bob.address, 100)
  .send({ from: alice.address });
await aliceToken.methods
  .mint_to_public(bob.address, 100)
  .send({ from: alice.address });
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/ts/aztecjs_multiple_wallets/index.ts#L34-L51" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/ts/aztecjs_multiple_wallets/index.ts#L34-L51</a></sub></sup>


## Register the contract

Bob's wallet must know the contract before it can call it. Fetch the deployed instance from the node and register it with the contract's artifact:

```typescript title="register_contract" showLineNumbers 
const tokenInstance = await node.getContract(aliceToken.address);
if (!tokenInstance) {
  throw new Error(`Token ${aliceToken.address} is not deployed`);
}
await bobWallet.registerContract(tokenInstance, TokenContract.artifact);
const bobToken = await TokenContract.at(aliceToken.address, bobWallet);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/ts/aztecjs_multiple_wallets/index.ts#L53-L60" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/ts/aztecjs_multiple_wallets/index.ts#L53-L60</a></sub></sup>


## Read the balances

Bob's wallet now syncs the notes Alice tagged for him and reads both balances:

```typescript title="read_balances" showLineNumbers 
const { result: privateBalance } = await bobToken.methods
  .balance_of_private(bob.address)
  .simulate({ from: bob.address });
const { result: publicBalance } = await bobToken.methods
  .balance_of_public(bob.address)
  .simulate({ from: bob.address });
console.log(`Bob's private balance: ${privateBalance}`);
console.log(`Bob's public balance: ${publicBalance}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/c0643538fa9523cca55eab25f5befd31b4d115b8/docs/lines/v6/examples/ts/aztecjs_multiple_wallets/index.ts#L62-L71" target="_blank" rel="noopener noreferrer">Source code: docs/lines/v6/examples/ts/aztecjs_multiple_wallets/index.ts#L62-L71</a></sub></sup>


Expected output:

```text
Bob's private balance: 100
Bob's public balance: 100
```

## Troubleshooting

- **The private balance is zero**: the recipient's wallet has not registered the sender. By default the wallet uses the transaction's sender for tags; a contract can set another one with `with_sender`.
- **`the contract is not registered`**: call `registerContract` in each wallet that calls or reads the contract, not only in the wallet that deployed it.

## Next steps

- [Note discovery](../foundational-topics/advanced/storage/note_discovery.md) explains how tags are computed and synced.
- [Testing with Aztec.js](./how_to_test.md) runs tests like this one against a local network.
