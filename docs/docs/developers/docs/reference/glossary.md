---
title: Glossary
tags: [protocol, glossary]
description: Comprehensive glossary of terms used throughout the Aztec documentation and protocol.
---

### ACIR (Abstract Circuit Intermediate Representation)

ACIR bytecode is the compilation target of private functions. ACIR expresses arithmetic circuits and has no control flow: any control flow in functions is either unrolled (for loops) or flattened (by inlining and adding predicates). ACIR contains different types of opcodes including arithmetic operations, BlackBoxFuncCall (for efficient operations like hashing), Brillig opcodes (for unconstrained hints), and MemoryOp (for dynamic array access). Private functions compiled to ACIR are executed by the ACVM (Abstract Circuit Virtual Machine) and proved using Barretenberg.

### AVM (Aztec Virtual Machine)

The Aztec Virtual Machine (AVM) executes the public section of a transaction. It is conceptually similar to the Ethereum Virtual Machine (EVM) but designed specifically for Aztec's needs. Public functions are compiled to AVM bytecode and executed by sequencers in the AVM. The AVM uses a flat memory model with tagged memory indexes to track maximum potential values and bit sizes. It supports control flow (if/else) and includes specific opcodes for blockchain operations like timestamp and address access, but doesn't allow arbitrary oracles for security reasons.

### Aztec

Aztec is a privacy-first Layer 2 rollup on Ethereum. It supports smart contracts with both private & public state and private & public execution.

`aztec` is a CLI tool (with an extensive set of parameters) that enables users to perform a wide range of tasks. It can: run a node, run a sandbox, execute tests, generate contract interfaces for javascript and more.

Full reference [here](environment_reference/cli_reference).

### Aztec Wallet

The Aztec Wallet is a CLI wallet, `aztec-wallet`, that allows a user to manage accounts and interact with an Aztec network. It includes a PXE.

Full reference [here](environment_reference/cli_wallet_reference).

### `aztec-nargo`

The command line tool used to compile Aztec contracts. It is a specific version of `nargo`, with additional transpiler for turning a contract's public function code from Noir brillig bytecode into Aztec Virtual Machine (AVM) bytecode.

You can read more about `nargo` [here](#nargo).

### `aztec-up`

`aztec-up` updates the local aztec executables to the latest version (default behavior) or to a specified version.

### Aztec.js

A [Node package](https://www.npmjs.com/package/@aztec/aztec.js) to help make Aztec dApps.

Read more and review the source code [here](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/yarn-project/aztec.js).

### Aztec.nr

[Aztec.nr](https://github.com/AztecProtocol/aztec-packages/tree/next/noir-projects/aztec-nr) is a framework for writing Aztec smart contracts with Noir that abstracts away state management. It handles things like note generation, state trees etc. It's essentially a giant Noir library which abstracts the complexities of interacting with Aztec.

Read more and review the source code [here](https://aztec.nr).

### Barretenberg

Aztec's cryptography back-end. Refer to the graphic at the top of [this page](https://medium.com/aztec-protocol/explaining-the-network-in-aztec-network-166862b3ef7d) to see how it fits in the Aztec architecture.

Barretenberg's source code can be found [here](https://github.com/AztecProtocol/barretenberg).

### bb / bb.js

`bb` (CLI) and its corresponding `bb.js` (node module) are tools that prove and verify circuits. It also has helpful functions such as: writing solidity verifier contracts, checking a witness, and viewing a circuit's gate count.

### Commitment

A cryptographic commitment is a hash of some data (plus randomness) that hides the original value but allows you to later prove you committed to that specific value, by proving knowledge of a valid preimage, without being able to change it.

In Aztec, a commitment refers to a cryptographic hash of a note. Rather than storing entire notes in a data tree, note commitments (hashes of the notes) are stored in a merkle tree called the note hash tree. Users prove that they have the note pre-image information when they update private state in a contract. This allows the network to verify the existence of private data without revealing its contents.

### Merkle Tree

A Merkle tree is a binary tree data structure where adjacent nodes are hashed together recursively to produce a single node called the root hash.

Merkle trees in Aztec are used to store cryptographic commitments. They are used across five Aztec Merkle trees: the note hash tree (stores commitments to private notes), the nullifier tree (stores nullifiers for spent notes), the public data tree (stores public state), the contract tree and the archive tree. All trees use domain-separated Poseidon2 hashing with specific tree identifiers and layer separation to ensure security and prevent cross-tree attacks.

### `nargo`

With `nargo`, you can start new projects, compile, execute, and test your Noir programs.

You can find more information in the nargo installation docs [here](https://noir-lang.org/docs/getting_started/installation/) and the nargo command reference [here](https://noir-lang.org/docs/reference/nargo_commands).

### Noir

Noir is a Domain Specific Language (DSL) for SNARK proving systems. It is used for writing smart contracts in Aztec because private functions on Aztec are implemented as SNARKs to support privacy-preserving operations.

### Noir Language Server

The Noir Language Server can be used in vscode to facilitate writing programs in Noir by providing syntax highlighting, circuit introspection and an execution interface. The Noir LSP addon allows the dev to choose their tool, nargo or aztec-nargo, when writing a pure Noir program or an Aztec smart contract.

You can find more info about the LSP [in the Noir docs](https://noir-lang.org/docs/tooling/language_server).

### Node

A node is a computer running Aztec software that participates in the Aztec network. A specific type of node is a sequencer. Nodes run the public execution environment (AVM), validate proofs, and maintain the 5 state Merkle trees (note hash, nullifier, public state, contract and archive trees).

The Aztec testnet rolls up to Ethereum Sepolia.

To run your own node see [here](../../../the_aztec_network/guides/run_nodes/index.md).

### Note

In Aztec, a Note is like an envelope containing private data. A commitment (hash) of this note is stored in an append-only Merkle tree and stored by all the nodes in the network. Notes can be encrypted to be shared with other users. Data in a note may represent some variable's state at a point in time.

### Note Discovery

Note discovery refers to the process of a user identifying and decrypting the encrypted notes that belong to them. Aztec uses a note tagging system where senders tag encrypted onchain logs containing notes in a way that only the sender and recipient can identify. The tag is derived from a shared secret and an index (a shared counter that increments each time the sender creates a note for the recipient). This allows users to efficiently find their notes without brute force decryption or relying on offchain communication.

### Nullifier

A nullifier is a unique value that, once posted publicly, proves something has been used or consumed without revealing what that thing was.

In the context of Aztec, a nullifier is derived from a note and signifies the note has been "spent" or consumed without revealing which specific note was spent. When a note is updated or spent in Aztec, the protocol creates a nullifier from the note data using the note owner's nullifier key. This nullifier is inserted into the nullifier Merkle tree. The nullifier mechanism prevents double-spending while maintaining privacy by not requiring deletion of the original note commitment, which would leak information.

### Partial Notes

Partial notes are a concept that allows users to commit to an encrypted value, and allows a counterparty to update that value without knowing the specific details of the encrypted value. They are notes that are created in a private function with values that are not yet considered finalized (e.g., `amount` in a `UintNote`). The partial note commitment is computed using multi scalar multiplication on an elliptic curve, then passed to a public function where another party can add value to the note without knowing its private contents. This enables use cases like private fee payments, DEX swaps, and lending protocols.

### Programmable Privacy

Aztec achieves programmable privacy through its hybrid architecture that supports both private and public smart contract execution. Private functions run client-side with zero-knowledge proofs, while public functions run onchain. This allows developers to program custom privacy logic, choosing what data remains private and what becomes public, with composability between private and public state and execution contexts.

### Provers

The Prover in a ZK system is the entity proving they have knowledge of a valid witness that satisfies a statement. In the context of Aztec, this is the entity that creates the proof that some computation was executed correctly. Here, the statement would be "I know the inputs and outputs that satisfy the requirements for the computation, and I did the computation correctly."

Aztec will be launched with a fully permissionless proving network (pieces of code that produce the proofs for valid rollup state transitions) that anyone can participate in.

How this works will be discussed via a future RFP process on Discourse, similarly to the Sequencer RFP.

### Proving Key

A key that is used to generate a proof. In the case of Aztec, these are compiled from Noir smart contracts.

### Private Execution Environment (PXE)

The private execution environment is where private computation occurs. This is local such as your device or browser.


Read more [here](../concepts/pxe/index.md).

### Sandbox

Sandbox is a local development Aztec network that runs on your machine and interacts with a development Ethereum node. It allows you to develop and deploy Noir smart contracts but without having to interact with testnet or mainnet (when the time comes).

Included in the sandbox:

- Local Ethereum network (Anvil)
- Deployed Aztec protocol contracts (for L1 and L2)
- A set of test accounts with some test tokens to pay fees
- Development tools to compile contracts and interact with the network (aztec-nargo and aztec-wallet)
- All of this comes packaged in a Docker container to make it easy to install and run.

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

### Statement

A statement in Aztec's zero-knowledge context refers to the public assertion being proved about a private computation. For example, a statement might be "I know the inputs and outputs that satisfy the requirements for this computation, and I executed the computation correctly." The statement defines what is being proven without revealing the private details (the witness) that prove it. In Aztec, statements typically involve proving correct execution of private functions, valid note ownership, or proper state transitions.

### Verifier

The entity responsible for verifying the validity of a ZK proof. In the context of Aztec, this is:
- **The sequencers**: verify that private functions were executed correctly.
- **The Ethereum L1 smart contract**: verifies batches of transactions were executed correctly.

### Verification Key

A key that is used to verify the validity of a proof generated from a proving key from the same smart contract.

### Witness

In the context of Aztec's zero-knowledge proofs, a witness refers to the private inputs and intermediate values that satisfy the constraints of a circuit. When executing a private function, the ACVM generates the witness of the execution - the complete set of values that prove the computation was performed correctly. The witness includes both the secret inputs provided by the user and all intermediate computational steps, but is never revealed publicly. Only a cryptographic proof of the witness's validity is shared.

### Zero-knowledge (ZK) proof

Zero-knowledge proofs in Aztec are cryptographic proofs that allow someone to prove they know certain information or have performed a computation correctly without revealing the underlying data. Aztec uses various ZK-SNARK protocols including UltraPlonk and Honk. These proofs enable private execution where users can prove they executed a private function correctly and that they own certain notes, without revealing the function inputs, note contents, or internal computation details. The proofs are verified onchain to ensure the integrity of private state transitions.
