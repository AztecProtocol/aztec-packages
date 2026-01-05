---
title: Transactions
sidebar_position: 3
tags: [protocol]
description: Comprehensive guide to the Aztec transaction lifecycle, covering private execution, PXE interactions, kernel circuits, and the step-by-step process from user request to L1 settlement.
---

import Image from '@theme/IdealImage';

On this page you'll learn:

- The step-by-step process of sending a transaction on Aztec
- The role of components like PXE, Aztec Node, and the sequencer
- The private and public kernel circuits and how they execute function calls
- The call stacks for private and public functions and how they determine a transaction's completion

## Simple Example of the (Private) Transaction Lifecycle

The transaction lifecycle for an Aztec transaction is fundamentally different from the lifecycle of an Ethereum transaction.

The introduction of the Private eXecution Environment (PXE) provides a safe environment for the execution of sensitive operations, ensuring that decrypted data are not accessible to unauthorized applications. However, the PXE exists client-side on user devices, which creates a different model for imagining what the lifecycle of a typical transaction might look like. The existence of a sequencing network also introduces some key differences between the Aztec transaction model and the transaction model used for other networks.

The accompanying diagram illustrates the flow of interactions between a user, their wallet, the PXE, the node operators (sequencers / provers), and the L1 chain.

<Image img={require("@site/static/img/transaction-lifecycle.png")} />

1. **The user initiates a transaction** – In this example, the user decides to privately send 10 DAI to gudcause.eth. After inputting the amount and the receiving address, the user clicks the confirmation button on their wallet.
2. **The PXE executes transfer locally** – The PXE, running locally on the user's device, executes the transfer method on the DAI token contract on Aztec and computes the state difference based on the user's intention. At this point, the transaction exists solely within the context of the PXE.
3. **The PXE proves correct execution** – The PXE proves correct execution (via zero-knowledge proofs) of the authorization and of the private transfer method. Once the proofs have been generated, the PXE sends the proofs and required inputs (new note commitments and nullifiers) to the sequencer.
4. **The sequencer processes the transaction** – The pseudorandomly-selected sequencer validates the transaction proofs. The sequencer also executes public functions and updates state: public state is updated by directly modifying entries in the sparse Merkle tree, while private state is updated by adding the newly created note commitments and nullifiers to the indexed Merkle trees. The sequencer then computes the new state root and posts the block to L1.
5. **The transaction settles to L1** – The block is posted to L1, and later, provers submit epoch proofs to the verifier contract on Ethereum. Once the epoch proof is verified, the state transitions are considered final and the private transfer has settled.

### Detailed Diagram

The following diagram provides a more detailed overview of the transaction execution process, highlighting three different types of transaction execution: contract deployments, private transactions, and public transactions.

<Image img={require("@site/static/img/local_network_sending_a_tx.png")} />

See the page on [contract communication](../aztec-nr/framework-description/functions/public_private_calls.md) for more context on transaction execution.

### Transaction Requests

Transaction requests are how transactions are constructed and sent to the network.

In Aztec.js:

```javascript title="constructor" showLineNumbers
constructor(
  /** Sender. */
  public origin: AztecAddress,
  /** Pedersen hash of function arguments. */
  public argsHash: Fr,
  /** Transaction context. */
  public txContext: TxContext,
  /** Function data representing the function to call. */
  public functionData: FunctionData,
  /** A salt to make the hash difficult to predict. The hash is used as the first nullifier if there is no nullifier emitted throughout the tx. */
  public salt: Fr,
) {}
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-devnet.20251212/yarn-project/stdlib/src/tx/tx_request.ts#L15-L28" target="_blank" rel="noopener noreferrer">Source code: yarn-project/stdlib/src/tx/tx_request.ts#L15-L28</a></sub></sup>

Where:

- `origin` is the account contract where the transaction is initiated from.
- `argsHash` is the hash of the arguments of the entrypoint call. The complete set of arguments is passed to the PXE as part of the [TxExecutionRequest](https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-devnet.20251212/yarn-project/stdlib/src/tx/tx_execution_request.ts) and checked against this hash.
- `txContext` contains the chain id, version, and gas settings.
- `functionData` contains the function selector and indicates whether the function is private or public.
- `salt` is used to make the transaction request hash difficult to predict. The hash is used as the first nullifier if no nullifier is emitted throughout the transaction.

An account contract validates that the transaction request has been authorized via its specified authorization mechanism, via the `is_valid_impl` function (e.g. [an ECDSA signature](https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-devnet.20251212/noir-projects/noir-contracts/contracts/account/ecdsa_k_account_contract/src/main.nr)).

Transaction requests are simulated in the PXE in order to generate the necessary inputs for generating proofs. Once transactions are proven, a [transaction object](https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-devnet.20251212/yarn-project/stdlib/src/tx/tx.ts#L26) is created and can be sent to the network to be included in a block.

#### Contract Interaction Methods

Most transaction requests are created as interactions with specific contracts. The exception is transactions that deploy contracts. Here are the main methods for interacting with contracts related to transactions.

1. [`simulate`](#simulate)
2. [`send`](#send)

##### `simulate`

```javascript title="simulate" showLineNumbers
/**
 * Simulate a transaction and get information from its execution.
 * Differs from prove in a few important ways:
 * 1. It returns the values of the function execution, plus additional metadata if requested
 * 2. It supports `utility`, `private` and `public` functions
 *
 * @param options - An optional object containing additional configuration for the simulation.
 * @returns Depending on the simulation options, this method directly returns the result value of the executed
 * function or a rich object containing extra metadata, such as estimated gas costs (if requested via options),
 * execution statistics and emitted offchain effects
 */
public async simulate<T extends SimulateInteractionOptions>(
  options: T,
): Promise<SimulationReturn<Exclude<T['fee'], undefined>['estimateGas']>>;
// eslint-disable-next-line jsdoc/require-jsdoc
public async simulate<T extends SimulateInteractionOptions>(
  options: T,
): Promise<SimulationReturn<T['includeMetadata']>>;
// eslint-disable-next-line jsdoc/require-jsdoc
public async simulate(
  options: SimulateInteractionOptions,
): Promise<SimulationReturn<typeof options.includeMetadata>> {
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-devnet.20251212/yarn-project/aztec.js/src/contract/contract_function_interaction.ts#L81-L104" target="_blank" rel="noopener noreferrer">Source code: yarn-project/aztec.js/src/contract/contract_function_interaction.ts#L81-L104</a></sub></sup>

##### `send`

```javascript title="send" showLineNumbers
/**
 * Sends a transaction to the contract function with the specified options.
 * This function throws an error if called on a utility function.
 * It creates and signs the transaction if necessary, and returns a SentTx instance,
 * which can be used to track the transaction status, receipt, and events.
 * @param options - An object containing 'from' property representing
 * the AztecAddress of the sender and optional fee configuration
 * @returns A SentTx instance for tracking the transaction status and information.
 */
public send(options: SendInteractionOptions): SentTx {
```

> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-devnet.20251212/yarn-project/aztec.js/src/contract/base_contract_interaction.ts#L30-L41" target="_blank" rel="noopener noreferrer">Source code: yarn-project/aztec.js/src/contract/base_contract_interaction.ts#L30-L41</a></sub></sup>

### Batch Transactions

Batched transactions are a way to send multiple transactions in a single call. They are created by the [`BatchCall` class in Aztec.js](https://github.com/AztecProtocol/aztec-packages/blob/v3.0.0-devnet.20251212/yarn-project/aztec.js/src/contract/batch_call.ts). This allows a batch of function calls from a single wallet to be sent as a single transaction through a wallet.

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

## Next Steps

- Learn about [accounts](./accounts/index.md) and how they authorize transactions
- Understand [state management](./state_management.md) and how transaction effects are stored
- Explore the [PXE](./pxe/index.md) in more detail
