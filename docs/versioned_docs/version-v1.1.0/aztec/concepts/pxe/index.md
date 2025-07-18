---
title: Private Execution Environment (PXE)
sidebar_position: 8
tags: [PXE]
keywords: [pxe, private execution environment]
importance: 1
---

import Image from "@theme/IdealImage";

This page describes the Private Execution Environment (PXE, pronounced "pixie"), a client-side library for the execution of private operations. It is a TypeScript library that can be run within Node.js, inside wallet software or a browser.

The PXE generates proofs of private function execution, and sends these proofs along with public function execution requests to the sequencer. Private inputs never leave the client-side PXE.

The PXE is responsible for:

- storing secrets (e.g. encryption keys, notes, tagging secrets for note discovery) and exposing an interface for safely accessing them
- orchestrating private function (circuit) execution and proof generation, including implementing [oracles](../../smart_contracts/oracles/index.md) needed for transaction execution
- syncing users' relevant network state, obtained from an Aztec node
- safely handling multiple accounts with siloed data and permissions

One PXE can handle data and secrets for multiple accounts, while also providing isolation between them as required.

## System architecture

```mermaid
flowchart TB
    User --Interacts with--> Wallet
    Wallet --Prompts--> User
    subgraph Browser
    Dapp
    end
    Dapp --Calls (requires auth)--> Wallet
    subgraph Client-side
        Wallet --Scoped--> PXE
        PXE --Execute/Prove--> Circuits
        Circuits --Oracle--> PXE
    end
    PXE --Queries world-state (causes privacy leaks)--> Node
    Wallet --Track tx state (may be handled via PXE)--> Node
```

## Components

### Transaction Simulator

An application will prompt the users PXE to execute a transaction (e.g. execute X function, with Y arguments, from Z account). The application or the wallet may handle gas estimation.

The ACIR (Abstract Circuit Intermediate Representation) simulator handles the execution of smart contract functions by simulating transactions. It generates the required data and inputs for these functions. You can find more details about how it works [here](./acir_simulator.md).

Until there are simulated simulations ([#9133](https://github.com/AztecProtocol/aztec-packages/issues/9133)), authwits are required for simulation, before attempting to prove.

### Proof Generation

After simulation, the wallet calls `proveTx` on the PXE with all of the data generated during simulation and any [authentication witnesses](../advanced/authwit.md) (for allowing contracts to act on behalf of the users' account contract).

Once proven, the wallet sends the transaction to the network and sends the transaction hash back to the application.

### Database

The database stores transactional data and notes within the user's PXE.

The database stores various types of data, including:

- **Notes**: Data representing users' private state. These are often stored on-chain, encrypted to a user. A contract will parse on-chain data to find notes relevant for users' accounts and they are stored in the PXE.
- **Authentication Witnesses**: Data used to approve others for executing transactions on your behalf. The PXE provides this data to transactions on-demand during transaction simulation via oracles.
- **Capsules**: External data or data injected into the system via [oracles](#oracles).
- **Address Book**: A list of expected addresses that a PXE may encrypt notes for, or received encrypted notes from. This list helps the PXE reduce the amount of work required to find notes relevant to it's registered accounts.

The PXE is not in charge of note discovery, ie finding the notes that are owned by the user. This is handled by Aztec contracts, and you can learn more [here](../advanced/storage/note_discovery.md)

### Authorization

The PXE handles access rights by:

1. action
2. domain
3. contract
4. account

For example, uniswap.com (**domain**) can query (**action**, involves execution that has access to an accounts' private state) on these five token **contracts** for these two **accounts** of mine, that are registered in the PXE.

Available actions include:

- Seeing that the accounts exist in the PXE
- Running queries, simulations, accessing logs, registering contracts, etc at a given a contract address
- Manually adding notes

Providing an application with an empty scopes array (e.g. `scopes: []`) to the PXE means that no information can be accessed, but no scopes (e.g. `scopes: undefined`) defaults to _all_ scopes being available.

### Contract management

Applications can add contract code required for a user to interact with the application to the users PXE. The PXE will check whether the required contracts have already been registered in users PXE. There are no getters to check whether the contract has been registered, as this could leak privacy (e.g. a dapp could check whether specific contracts have been registered in a users PXE and infer information about their interaction history).

### Keystore

The keystore is a secure storage for private and public keys.

### Oracles

Oracles are pieces of data that are injected into a smart contract function from the client side. You can read more about why and how they work in the [smart contracts section](../../smart_contracts/oracles/index.md).

## For developers

To learn how to develop on top of the PXE, refer to these guides:

- [Run more than one PXE on your local machine](../../../developers/guides/local_env/run_more_than_one_pxe_sandbox.md)
- [Use in-built oracles including oracles for arbitrary data](../../../developers/guides/smart_contracts/writing_contracts/how_to_use_capsules.md)
