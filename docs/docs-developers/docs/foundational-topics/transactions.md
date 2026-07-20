---
title: Transactions
sidebar_position: 3
tags: [protocol]
description: Comprehensive guide to the Aztec transaction lifecycle, covering private execution, PXE interactions, kernel circuits, and the step-by-step process from user request to L1 settlement.
references: ["noir-projects/noir-contracts/contracts/account/ecdsa_k_account_contract/*", "yarn-project/aztec.js/src/contract/*", "yarn-project/stdlib/src/tx/*"]
---

import Image from '@theme/IdealImage';
import YouTubeEmbed from '@site/src/components/YouTubeEmbed';

On this page you'll learn:

- The step-by-step process of sending a transaction on Aztec
- The role of components like PXE, Aztec Node, and the sequencer
- The private and public kernel circuits and how they execute function calls
- The call stacks for private and public functions and how they determine a transaction's completion

For a two-minute visual overview of how a single transaction spans private and public execution, watch this explainer (find more on the [video lessons](../resources/video_lessons.mdx) page):

<YouTubeEmbed videoId="MayopgQ1FjI" title="One Transaction, Two Worlds: Private and Public State on Aztec" />

## Simple Example of the (Private) Transaction Lifecycle

The transaction lifecycle for an Aztec transaction is fundamentally different from the lifecycle of an Ethereum transaction.

The introduction of the Private eXecution Environment (PXE) provides a safe environment for the execution of sensitive operations, ensuring that decrypted data are not accessible to unauthorized applications. However, the PXE exists client-side on user devices, which creates a different model for imagining what the lifecycle of a typical transaction might look like. The existence of a sequencing network also introduces some key differences between the Aztec transaction model and the transaction model used for other networks.

The accompanying diagram illustrates the flow of interactions between a user, their wallet, the PXE, the node operators (sequencers / provers), and the L1 chain.

<Image img={require("@site/static/img/transaction-lifecycle.png")} />

1. **The user initiates a transaction** – In this example, the user decides to privately send 10 DAI to gudcause.eth. After inputting the amount and the receiving address, the user clicks the confirmation button on their wallet.
2. **The PXE executes transfer locally** – The PXE, running locally on the user's device, executes the transfer method on the DAI token contract on Aztec and computes the state difference based on the user's intention. At this point, the transaction exists solely within the context of the PXE.
3. **The PXE proves correct execution** – The PXE proves correct execution (via zero-knowledge proofs) of the authorization and of the private transfer method. Once the proofs have been generated, the PXE sends the proofs and required inputs (new note commitments and nullifiers) to the sequencer.
4. **The sequencer processes the transaction** – The pseudorandomly-selected sequencer validates the transaction proofs along with required inputs for this private transfer. The sequencer also executes public functions and updates state: public state is updated by directly modifying entries in the sparse Merkle tree, while private state is updated by adding the newly created note commitments and nullifiers to the indexed Merkle trees. The sequencer computes the new state root, includes the transaction in a block, and propagates the block over the p2p network. At this point the transaction has status `proposed`.
5. **The transaction settles to L1** – At the end of its slot, the sequencer bundles the blocks it built into a checkpoint and posts it to L1 (status `checkpointed`). Later, provers submit epoch proofs to the verifier contract on Ethereum (status `proven`), and once the proof's L1 transaction is in a finalized Ethereum block the transfer is irreversible (status `finalized`). See [block production and finality](./block_production.md) for what each status guarantees.

### Detailed Diagram

The following diagram provides a more detailed overview of the transaction execution process, highlighting three different types of transaction execution: contract deployments, private transactions, and public transactions.

<Image img={require("@site/static/img/local_network_sending_a_tx.png")} />

See the page on [call types](./call_types.md) for more context on transaction execution.

### Transaction Requests

Transaction requests are how transactions are constructed and sent to the network.

In Aztec.js:

#include_code constructor yarn-project/stdlib/src/tx/tx_request.ts javascript

Where:

- `origin` is the account contract where the transaction is initiated from.
- `argsHash` is the hash of the arguments of the entrypoint call. The complete set of arguments is passed to the PXE as part of the `TxExecutionRequest` and checked against this hash.
- `txContext` contains the chain id, version, and gas settings.
- `functionData` contains the function selector and indicates whether the function is private or public.
- `salt` is used to make the transaction request hash difficult to predict. The hash is used as the first nullifier if no nullifier is emitted throughout the transaction.

The `TxExecutionRequest` class:

#include_code tx_execution_request_class yarn-project/stdlib/src/tx/tx_execution_request.ts javascript

An account contract validates that the transaction request has been authorized via its specified authorization mechanism, via the `is_valid_impl` function. Here is an example using an ECDSA signature:

#include_code is_valid_impl noir-projects/noir-contracts/contracts/account/ecdsa_k_account_contract/src/main.nr rust

Transaction requests are simulated in the PXE in order to generate the necessary inputs for generating proofs. Once transactions are proven, a `Tx` object is created and can be sent to the network to be included in a block:

#include_code tx_class yarn-project/stdlib/src/tx/tx.ts javascript

#### Contract Interaction Methods

Most transaction requests are created as interactions with specific contracts. The exception is transactions that deploy contracts. Here are the main methods for interacting with contracts related to transactions.

1. [`simulate`](#simulate)
2. [`send`](#send)

##### `simulate`

#include_code simulate yarn-project/aztec.js/src/contract/contract_function_interaction.ts javascript

##### `send`

#include_code send yarn-project/aztec.js/src/contract/base_contract_interaction.ts javascript

### Batch Transactions

Batched transactions are a way to send multiple transactions in a single call. They are created by the `BatchCall` class in Aztec.js. This allows a batch of function calls from a single wallet to be sent as a single transaction through a wallet.

#include_code batch_call_class yarn-project/aztec.js/src/contract/batch_call.ts javascript

### Enabling Transaction Semantics

There are two kernel circuits in Aztec, the private kernel and the public kernel. Each circuit validates the correct execution of a particular function call.

A transaction is built up by generating proofs for multiple recursive iterations of kernel circuits. Each call in the call stack is modeled as a new iteration of the kernel circuit and is managed by a [FIFO](<https://en.wikipedia.org/wiki/FIFO_(computing_and_electronics)>) queue containing pending function calls. There are two call stacks, one for private calls and one for public calls.

One iteration of a kernel circuit will pop a call off of the stack and execute the call. If the call triggers subsequent contract calls, these are pushed onto the stack.

Private kernel proofs are generated first. The transaction is ready to move to the next phase when the private call stack is empty.

The public kernel circuit takes in proof of a public/private kernel circuit with an empty private call stack, and operates recursively until the public call stack is also empty.

A transaction is considered complete when both call stacks are empty.

The only information leaked about the transaction is:

1. The number of private state updates triggered
2. The set of public calls generated

The addresses of all private calls are hidden from observers.

## Transaction phases

An Aztec transaction is split into up to three phases at execution time. The boundaries matter mostly when integrating with fee-paying contracts (FPCs): which phase a call runs in determines whether it can revert, which public functions it is allowed to call, and when its side effects become final.

### Setup phase (non-revertible)

The setup phase runs before the user's application logic. Fee-related bookkeeping happens here:

- The fee payer is nominated via a call to the protocol's `set_as_fee_payer()` function. An FPC typically calls this in its entrypoint; a user paying directly with Fee Juice does it implicitly via the default entrypoint.
- `end_setup()` is called to mark the boundary between the non-revertible and revertible phases. Everything committed before `end_setup()` stands regardless of whether later phases revert.

Because the setup phase is non-revertible, the protocol restricts which public function calls are allowed during it. The default allowlist permits a small set of trusted setup functions (for example those on `AuthRegistry` and `FeeJuice`); in v4.2.0, public token functions such as `transfer_in_public` and `_increase_public_balance` were removed from it. See the [migration note](../resources/migration_notes.md#custom-token-fpcs-removed-from-default-public-setup-allowlist) for details.

Practical consequences:

- A fee payment committed during setup is charged to the payer even if the app phase later reverts.
- An FPC cannot collect payment by directly calling an arbitrary user token's public transfer during setup. It either works purely in the private domain, or relies on a token function the network operator has added to the allowlist.

### App phase (revertible)

The app phase runs the user's actual transaction logic. Private execution has already happened locally in the PXE before the transaction was submitted (producing the proof, nullifiers, and note commitments included with the transaction); what runs in this phase is the public call stack. It starts with the public calls that private execution enqueued, and grows as those public calls themselves enqueue further public calls. If any public call in this phase reverts, all state changes from the phase are discarded, but fees committed during setup are still paid.

### Teardown phase (optional)

Transactions can optionally include a teardown phase after app execution. During teardown, the final transaction fee is available to public functions, which is useful for FPCs that want to refund unused gas to the user. Not every FPC uses teardown; some charge a fixed quoted amount with no refund, retaining any surplus in the FPC's Fee Juice balance.

## Next Steps

- Understand [block production and finality](./block_production.md): how blocks, checkpoints, and epochs determine when a transaction is final
- Learn about [accounts](./accounts/index.md) and how they authorize transactions
- Understand [state management](./state_management.md) and how transaction effects are stored
- Explore the [PXE](./pxe/index.md) in more detail
- Understand the [performance impact of kernel circuits](./advanced/circuits/private_kernel.md#performance-impact) on proving time
