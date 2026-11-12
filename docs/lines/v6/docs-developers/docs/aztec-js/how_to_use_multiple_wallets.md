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

#include_code create_wallets /docs/lines/v6/examples/ts/aztecjs_multiple_wallets/index.ts typescript

Then add one account to each wallet. This example uses the local network's funded test accounts, so neither account needs to be deployed:

#include_code load_accounts /docs/lines/v6/examples/ts/aztecjs_multiple_wallets/index.ts typescript

On another network, create and deploy each account in its own wallet as shown in [Creating Accounts](./how_to_create_account.md).

## Register the sender

A recipient's PXE finds its notes by computing tags from a secret it shares with each sender it knows (see [Note discovery](../foundational-topics/advanced/storage/note_discovery.md#registering-known-senders)). A wallet treats its own accounts as known senders, but Bob's wallet has never heard of Alice. Register her before you expect notes from her:

#include_code register_sender /docs/lines/v6/examples/ts/aztecjs_multiple_wallets/index.ts typescript

Without this call, Bob's private balance reads as zero even after Alice sends him tokens.

## Send private and public tokens

Alice deploys a token from her wallet and mints to Bob, once privately and once publicly. Her wallet does not need Bob's account: it encrypts the private note to Bob's address.

#include_code deploy_and_mint /docs/lines/v6/examples/ts/aztecjs_multiple_wallets/index.ts typescript

## Register the contract

Bob's wallet must know the contract before it can call it. Fetch the deployed instance from the node and register it with the contract's artifact:

#include_code register_contract /docs/lines/v6/examples/ts/aztecjs_multiple_wallets/index.ts typescript

## Read the balances

Bob's wallet now syncs the notes Alice tagged for him and reads both balances:

#include_code read_balances /docs/lines/v6/examples/ts/aztecjs_multiple_wallets/index.ts typescript

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
