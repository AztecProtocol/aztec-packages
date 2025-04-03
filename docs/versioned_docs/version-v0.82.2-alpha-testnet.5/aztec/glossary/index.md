---
title: Glossary
---

### `aztec-nargo`

The command line tool used to compile Aztec contracts. It gets its name from the Noir compiler, `nargo`. `aztec-nargo` is really just a specific version of `nargo`. You can read more about `nargo` [here](#nargo).

### Aztec.nr

A [Noir](https://noir-lang.org) framework for writing smart contracts on Aztec.

Read more and review the source code [here](https://aztec.nr).

### Barretenberg

Aztec's cryptography back-end. Refer to the graphic at the top of [this page](https://medium.com/aztec-protocol/explaining-the-network-in-aztec-network-166862b3ef7d) to see how it fits in the Aztec architecture.

Barretenberg's source code can be found [here](https://github.com/AztecProtocol/barretenberg).

### `nargo`

With `nargo`, you can start new projects, compile, execute, prove, verify, test, generate solidity contracts, and do pretty much all that is available in Noir.

You can find more information in the nargo installation docs [here](https://noir-lang.org/docs/getting_started/installation/) and the nargo command reference [here](https://noir-lang.org/docs/reference/nargo_commands).

### Noir

Noir is a Domain Specific Language for SNARK proving systems. It is used for writing smart contracts in Aztec because private functions on Aztec are implemented as SNARKs to support privacy-preserving operations.

### Provers

Aztec will be launched with a fully permissionless proving network that anyone can participate in.

How this works will be discussed via a future RFP process on Discourse, similarly to the Sequencer RFP.

### Private Execution Environment

The Private eXecution Environment (PXE) is a client-side library for the execution of private operations. The PXE generates proofs of private function execution, and sends these proofs along with public function requests to the sequencer. Private inputs never leave the client-side PXE.

Read more [here](../concepts/pxe/index.md).

### Sequencer

Aztec will be launched with a fully permissionless sequencer network that anyone can participate in.

How this works is being discussed actively in the [Discourse forum](https://discourse.aztec.network/t/request-for-proposals-decentralized-sequencer-selection/350/). Once this discussion process is completed, we will update the glossary and documentation with specifications and instructions for how to run.

Sequencers are generally responsible for:

- Selecting pending transactions from the mempool
- Ordering transactions into a block
- Verifying all private transaction proofs and execute all public transactions to check their validity
- Computing the ROLLUP_BLOCK_REQUEST_DATA
- Computing state updates for messages between L2 & L1
- Broadcasting the ROLLUP_BLOCK_REQUEST_DATA to the prover network via the proof pool for parallelizable computation.
- Building a rollup proof from completed proofs in the proof pool
- Tagging the pending block with an upgrade signal to facilitate forks
- Publishing completed block with proofs to Ethereum as an ETH transaction

Previously in [Aztec Connect](https://medium.com/aztec-protocol/sunsetting-aztec-connect-a786edce5cae) there was a single sequencer, and you can find the Typescript reference implementation called Falafel [here](https://github.com/AztecProtocol/aztec-connect/tree/master/yarn-project/falafel).

### Smart Contracts

Programs that run on the Aztec network are called smart contracts, similar to [programs](https://ethereum.org/en/developers/docs/smart-contracts/) that run on Ethereum.

However, these will be written in the [Noir](https://noir-lang.org/index.html) programming language, and may optionally include private state and private functions.

### Proving Key

A key that is used to generate a proof. In the case of Aztec, these are compiled from Noir smart contracts.

### Verification Key

A key that is used to verify the validity of a proof generated from a proving key from the same smart contract.
