---
title: Wallet Architecture
tags: [protocol, accounts]
description: Understand the architecture of Aztec wallets and how they interact with the PXE to manage accounts and transactions.
---

This page talks about the architecture of a wallet in Aztec. Wallets expose to dapps an interface that allows them to act on behalf of the user, such as querying private state or sending transactions. Bear in mind that, as in Ethereum, wallets should require user confirmation whenever carrying out a potentially sensitive action requested by a dapp.

## Overview

Architecture-wise, a wallet is an instance of an **Private Execution Environment (PXE)** which manages user keys and private state.
The PXE also communicates with an **Aztec Node** for retrieving public information or broadcasting transactions.
Note that the PXE requires a local database for keeping private state, and is also expected to be continuously syncing new blocks for trial-decryption of user notes.

Additionally, a wallet must be able to handle one or more account contract implementation. When a user creates a new account, the account is represented onchain by an account contract. The wallet is responsible for deploying and interacting with this contract. A wallet may support multiple flavours of accounts, such as an account that uses ECDSA signatures, or one that relies on WebAuthn, or one that requires multi-factor authentication. For a user, the choice of what account implementation to use is then determined by the wallet they interact with.

In code, this translates to a wallet implementing an **AccountInterface** interface that defines [how to create an _execution request_ out of an array of _function calls_](./index.md#transaction-lifecycle) for the specific implementation of an account contract and [how to generate an _auth witness_](./index.md#authorizing-actions) for authorizing actions on behalf of the user. Think of this interface as the Javascript counterpart of an account contract, or the piece of code that knows how to format a transaction and authenticate an action based on the rules defined by the user's account contract implementation.

## Account interface

The account interface is used for creating an _execution request_ out of one or more _function calls_ requested by a dapp, as well as creating an _auth witness_ for a given message hash. Account contracts are expected to handle multiple function calls per transaction, since dapps may choose to batch multiple actions into a single request to the wallet.

```typescript title="account-interface" showLineNumbers 

/**
 * Handler for interfacing with an account. Knows how to create transaction execution
 * requests and authorize actions for its corresponding account.
 */
export interface AccountInterface extends EntrypointInterface, AuthWitnessProvider {
  /** Returns the complete address for this account. */
  getCompleteAddress(): CompleteAddress;

  /** Returns the address for this account. */
  getAddress(): AztecAddress;

  /** Returns the chain id for this account */
  getChainId(): Fr;

  /** Returns the rollup version for this account */
  getVersion(): Fr;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-nightly.20251007/yarn-project/aztec.js/src/account/interface.ts#L6-L25" target="_blank" rel="noopener noreferrer">Source code: yarn-project/aztec.js/src/account/interface.ts#L6-L25</a></sub></sup>

