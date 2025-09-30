---
title: Glossary
tags: [protocol, glossary]
description: Comprehensive glossary of terms used throughout the Aztec documentation and protocol.
---

import { Glossary } from '@site/src/components/Snippets/glossary_snippets';

### Aztec

Aztec is a privacy-first Layer 2 rollup on Ethereum. It supports smart contracts with both private & public state and private & public execution.

<Glossary.Tools.aztec />

Full reference [here](environment_reference/cli_reference).

### Aztec Wallet

Wallet specific for interacting with Aztec. It handles things like note generation and parsing, sending transactions and more. It runs a PXE and has persistent storage to remember user accounts, notes and registered contracts.


<Glossary.Tools.aztec_wallet />

Full reference [here](environment_reference/cli_wallet_reference).

### `aztec-nargo`

Aztec specific version of the build tool Nargo for compiling contracts and interacting with the network.

<Glossary.Tools.aztec_nargo />

You can read more about `nargo` [here](#nargo).

### `aztec-up`

`aztec-up` allows you to install the latest version of Aztec.

<Glossary.Tools.aztec_up />

### Aztec.js

<Glossary.Libs.aztec_js />

Read more and review the source code [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/yarn-project/aztec.js).

### Aztec.nr

[Aztec.nr](https://github.com/AztecProtocol/aztec-packages/tree/next/noir-projects/aztec-nr) is a framework for writing Aztec smart contracts with Noir that abstracts away state management. It handles things like note generation, state trees etc. It's essentially a giant Noir library which abstracts the complexities of interacting with Aztec.

<Glossary.Libs.aztec_nr />

Read more and review the source code [here](https://aztec.nr).

### Barretenberg

[Barretenberg](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg) is a proving backend built for Noir to create proofs from circuits and verify them.

<Glossary.Barretenberg />

### bb / bb.js

`bb` (CLI) and its corresponding `bb.js` (node module) are tools that prove and verify circuits. It also has helpful functions such as: writing solidity verifier contracts, checking a witness, and viewing a circuit's gate count.

### `nargo`

With `nargo`, you can start new projects, compile, execute, and test your Noir programs.

You can find more information in the nargo installation docs [here](https://noir-lang.org/docs/getting_started/installation/) and the nargo command reference [here](https://noir-lang.org/docs/reference/nargo_commands).

### Noir

[Noir](https://noir-lang.org/) is a domain specific language (DSL) for writing circuits and Aztec smart contracts.

<Glossary.Noir />

### Noir Language Server

The Noir Language Server can be used in vscode to facilitate writing programs in Noir by providing syntax highlighting, circuit introspection and an execution interface. The Noir LSP addon allows the dev to choose their tool, nargo or aztec-nargo, when writing a pure Noir program or an Aztec smart contract.

You can find more info about the LSP [in the Noir docs](https://noir-lang.org/docs/tooling/language_server).

### Node

A node is a computer running the blockchain software that participates in the network. A specific type of node is a sequencer. Nodes run the public execution environment (AVM), validate proofs, and maintain the 5 state Merkle trees (note hash, nullifier, private state, contract and archive trees).

<Glossary.AztecNode />

To run your own node see [here](../../../the_aztec_network/guides/run_nodes/index.md).

### Note

In Aztec, a Note is like an envelope containing private data. A commitment (hash) of this note is stored in an append-only Merkle tree and stored by all the nodes in the network. Notes can be encrypted to be shared with other users. Data in a note may represent some variable's state at a point in time.

### Provers

The Prover in a ZK system is the entity proving they have knowledge of a valid witness that satisfies a statement. In the context of Aztec, this is the entity that creates the proof that some computation was executed correctly. Here, the statement would be "I know the inputs and outputs that satisfy the requirements for the computation, and I did the computation correctly.

Aztec will be launched with a fully permissionless proving network (pieces of code that produce the proofs for valid rollup state transitions) that anyone can participate in.

How this works will be discussed via a future RFP process on Discourse, similarly to the Sequencer RFP.

### Proving Key

A key that is used to generate a proof. In the case of Aztec, these are compiled from Noir smart contracts.

### Private Execution Environment (PXE)

The private execution enviroment is where private computation occurs. This local such as your device or browser.

<Glossary.PXE />

Read more [here](../concepts/pxe/index.md).

### Sandbox

Sandbox is a local development Aztec network that runs on your machine and interacts with a development Ethereum node. It allows you to develop and deploy Noir smart contracts but without having to interact with testnet or mainnet (when the time comes).

Included in the sandbox:

- Local Ethereum network (Anvil)
- Deployed Aztec protocol contracts (for L1 and L2)
- A set of test accounts with some test tokens to pay fees
- Development tools to compile contracts and interact with the network (aztec-nargo and aztec-wallet)
- All of this comes packages in a Docker container to make it easy to install and run.

<Glossary.AztecSandbox />

### Sequencer

A sequencer is a specialized node that is generally responsible for:

- Selecting pending transactions from the mempool
- Ordering transactions into a block
- Verifying all private transaction proofs and execute all public transactions to check their validity
- Computing the ROLLUP_BLOCK_REQUEST_DATA
- Computing state updates for messages between L2 & L1
- Broadcasting the ROLLUP_BLOCK_REQUEST_DATA to the prover network via the proof pool for parallelizable computation.
- Building a rollup proof from completed proofs in the proof pool
- Tagging the pending block with an upgrade signal to facilitate forks
- Publishing completed block with proofs to Ethereum as an ETH transaction


Aztec will be launched with a fully permissionless sequencer network that anyone can participate in.

How this works is being discussed actively in the [Discourse forum](https://discourse.aztec.network/t/request-for-proposals-decentralized-sequencer-selection/350/). Once this discussion process is completed, we will update the glossary and documentation with specifications and instructions for how to run.

Previously in [Aztec Connect](https://medium.com/aztec-protocol/sunsetting-aztec-connect-a786edce5cae) there was a single sequencer, and you can find the Typescript reference implementation called Falafel [here](https://github.com/AztecProtocol/aztec-connect/tree/master/yarn-project/falafel).

### Smart Contracts

Programs that run on the Aztec network are called smart contracts, similar to [programs](https://ethereum.org/en/developers/docs/smart-contracts/) that run on Ethereum.

However, these will be written in the [Noir](https://noir-lang.org/index.html) programming language, and may optionally include private state and private functions.

### Verifier

The entity resposible for verifying the validity of a ZK proof. In the context of Aztec, this is:
- **The sequencers**: verify that private functions were executed correctly.
- **The Ethereum L1 smart contract**: verifies batches of transactions were executed correctly.

### Verification Key

A key that is used to verify the validity of a proof generated from a proving key from the same smart contract.
