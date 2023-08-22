# Architecture

Wallets expose to dapps an interface that allows them to act on behalf of the user, such as querying private state or sending transactions. As in Ethereum, wallets should require user confirmation whenever carrying out a potentially sensitive action requested by a dapp.

## Overview

Architecture-wise, a wallet is an instance of an **Aztec RPC Server** which manages user keys and private state and communicates with an **Aztec Node** for retrieving public information or broadcasting transactions. Note that the RPC server requires a local database for keeping private state, and is also expected to be continuously syncing new blocks for trial-decryption of user notes.

Additionally, a wallet must implement an **Entrypoint** interface that defines [how to create an execution request](./main.md#transaction-lifecycle) out of a user intent for the specific implementation of account contract used by the wallet. Think of the entrypoint interface as the Javascript counterpart of an account contract, or the piece of code that knows how to format and authenticate a transaction based on the rules defined in Noir by the user's account.

## Entrypoint interface

The entrypoint interface is used for creating an execution request out of a set of function calls that describe user intents. Note that an account contract may not handle batching, in which case it is expected to throw if more than a single function call is requested.

#include_code entrypoint-interface /yarn-project/aztec.js/src/account/entrypoint/index.ts typescript

Refer to the page on [writing an account contract](./writing_an_account_contract.md) for an example on how to implement this interface.

## RPC interface

A wallet exposes the RPC interface to dapps by running an [Aztec RPC Server instance](https://github.com/AztecProtocol/aztec-packages/blob/95d1350b23b6205ff2a7d3de41a37e0bc9ee7640/yarn-project/aztec-rpc/src/aztec_rpc_server/aztec_rpc_server.ts). The Aztec RPC Server requires a keystore and a database implementation for storing keys, private state, and recipient encryption public keys.

#include_code rpc-interface /yarn-project/types/src/interfaces/aztec_rpc.ts typescript





