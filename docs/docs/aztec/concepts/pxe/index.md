---
title: Private Execution Environment (PXE)
sidebar_position: 6
tags: [PXE]
keywords: [pxe, private execution environment]
importance: 1
---

import Image from "@theme/IdealImage";

This page describes the Private Execution Environment (PXE), a client-side library for the execution of private operations.

The Private Execution Environment (or PXE, pronounced 'pixie') is a client-side library for the execution of private operations. It is a TypeScript library that can be run within Node.js, inside wallet software or a browser.

The PXE is a client-side interface of the PXE Service, which is a set of server-side APIs for interacting with the network. The PXE generates proofs of private function execution, and sends these proofs along with public function requests to the sequencer. Private inputs never leave the client-side PXE.

The PXE is responsible for:

- storing secrets (e.g. encryption keys, notes, tagging secrets for note discovery) and exposing an interface for safely accessing them
- orchestrating private function (circuit) execution and proof generation, including implementing [oracles](../../smart_contracts/oracles/index.md) needed for transaction execution
- syncing relevant network state, obtained from an Aztec node

One PXE can handle data and secrets for multiple accounts.

## System architecture

```mermaid
flowchart TB
    User --Interacts with--> Wallet
    Wallet --Prompts--> User
    subgraph Browser
    Dapp
    end
    Dapp --Calls\n(requires auth)--> Wallet
    subgraph Extension
        Wallet --Scoped--> PXE
        PXE --Execute/Prove--> Circuits
        Circuits --Oracle--> PXE
    end
    PXE --Queries world-state\n(causes privacy leaks)--> Node
    Wallet --Track tx state\n(may be handled via PXE)--> Node

```

## Components

### ACIR simulator

The ACIR (Abstract Circuit Intermediate Representation) simulator handles the execution of smart contract functions by simulating transactions. It generates the required data and inputs for these functions. You can find more details about how it works [here](./acir_simulator.md).

### Database

The database stores transactional data and notes within the user's PXE.

The database stores various types of data, including:

- **Notes**: Encrypted representations of assets.
- **Deferred Notes**: Notes that are intended for a user but cannot yet be decoded due to the associated contract not being present in the database. When new contracts are deployed, there may be some time before it is accessible from the PXE database. When the PXE database is updated, deferred note are decoded.
- **Authentication Witnesses**: Data used to approve others for executing transactions on your behalf.
- **Capsules**: External data or data injected into the system via [oracles](#oracles).

### Note discovery

There is an open RFP for how note discovery will work on Aztec. You can find more information in the [forum](https://forum.aztec.network/t/request-for-proposals-note-discovery-protocol/2584).

Currently in the Aztec sandbox, users download every note, compute a secret, and generate the symmetric decryption key from that secret. If the note belongs to them, then the user will have derived the same secret and ultimately the required decryption key.

### Keystore

The keystore is a secure storage for private and public keys.

## Oracles

Oracles are pieces of data that are injected into a smart contract function from the client side. You can read more about why and how they work in the [smart contracts section](../../smart_contracts/oracles/index.md).

## For developers

To learn how to develop on top of the PXE, refer to these guides:

- [Run more than one PXE on your local machine](../../../guides/developer_guides/local_env/run_more_than_one_pxe_sandbox.md)
- [Use in-built oracles including oracles for arbitrary data](../../../guides/developer_guides/smart_contracts/writing_contracts/how_to_pop_capsules.md)
