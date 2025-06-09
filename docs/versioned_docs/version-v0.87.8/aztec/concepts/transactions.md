---
title: Transactions
sidebar_position: 3
tags: [protocol]
---

import Image from '@theme/IdealImage';

On this page you'll learn:

- The step-by-step process of sending a transaction on Aztec
- The role of components like PXE, Aztec Node, ACIR simulator, and the sequencer
- The Aztec Kernel and its two circuits: private and public, and how they execute function calls
- The call stacks for private & public functions and how they determine a transaction's completion

## Simple Example of the (Private) Transaction Lifecycle

The transaction lifecycle for an Aztec transaction is fundamentally different from the lifecycle of an Ethereum transaction.

The introduction of the Private eXecution Environment (PXE) provides a safe environment for the execution of sensitive operations, ensuring that decrypted data are not accessible to unauthorized applications. However, the PXE exists client-side on user devices, which creates a different model for imagining what the lifecycle of a typical transaction might look like. The existence of a sequencing network also introduces some key differences between the Aztec transaction model and the transaction model used for other networks.

The accompanying diagram illustrates the flow of interactions between a user, their wallet, the PXE, the node operators (sequencers / provers), and the L1 chain.

<Image img={require("@site/static/img/transaction-lifecycle.png")} />

1. **The user initiates a transaction** – In this example, the user decides to privately send 10 DAI to gudcause.eth. After inputting the amount and the receiving address, the user clicks the confirmation button on their wallet.

_The transaction has not been broadcasted to the sequencer network yet. For now, the transaction exists solely within the context of the PXE._

2. **The PXE executes transfer locally** – The PXE, running locally on the user's device, executes the transfer method on the DAI token contract on Aztec and computes the state difference based on the user’s intention.

_The transaction has still not been broadcasted to the sequencer network yet and continues to live solely within the context of the PXE._

3. **The PXE proves correct execution** – At this point, the PXE proves correct execution (via zero-knowledge proofs) of the authorization and of the private transfer method. Once the proofs have been generated, the PXE sends the proofs and required inputs (inputs are new note commitments, stored in the note hash tree and nullifiers stored in the nullifiers tree) to the sequencer. Nullifiers are data that invalidate old commitments, ensuring that commitments can only be used once.

_The sequencer has received the transaction proof and can begin to process the transaction - verifying proofs and applying updates to the relevant data trees - alongside other public and private transactions._

4. **The sequencer has the necessary information to act** – the randomly-selected sequencer (based on the Fernet sequencer selection protocol) validates the transaction proofs along with required inputs (e.g. the note commitments and nullifiers) for this private transfer. The sequencer also executes public functions and requests proofs of public execution from a prover network. The sequencer updates the corresponding data trees and does the same for other private transactions. When the sequencer receives proofs from the prover network, the proofs will be bundled into a final rollup proof.

_The sequencer has passed the transaction information – proofs of correct execution and authorization, or public function execution information – to the prover, who will submit the new state root to Ethereum._

5. **The transaction settles to L1** – the verifier contract on Ethereum can now validate the rollup proof and record a new state root. The state root is submitted to the rollup smart contract. Once the state root is verified in an Ethereum transaction, the private transfer has settled and the transaction is considered final.

### Detailed Diagram

Transactions on Aztec start with a call from Aztec.js, which creates a request containing transaction details. This request moves to the Private Execution Environment (PXE) which simulates and processes it. Then the PXE interacts with the Aztec Node which uses the sequencer to ensure that all the transaction details are enqueued properly. The sequencer then submits the block to the rollup contract, and the transaction is successfully mined.

<Image img={require("@site/static/img/sandbox_sending_a_tx.png")} />

See [this diagram](https://raw.githubusercontent.com/AztecProtocol/aztec-packages/2fa143e4d88b3089ebbe2a9e53645edf66157dc8/docs/static/img/sandbox_sending_a_tx.svg) for a more detailed overview of the transaction execution process. It highlights 3 different types of transaction execution: contract deployments, private transactions and public transactions.

See the page on [contract communication](../smart_contracts/functions/public_private_calls.md) for more context on transaction execution.

### Transaction Requests

Transaction requests are how transactions are constructed and sent to the network.

In Aztec.js:

```javascript title="constructor" showLineNumbers 
constructor(
  /** Sender. */
  public origin: AztecAddress,
  /** Function data representing the function to call. */
  public functionData: FunctionData,
  /** Pedersen hash of function arguments. */
  public argsHash: Fr,
  /** Transaction context. */
  public txContext: TxContext,
  /** A salt to make the hash difficult to predict. The hash is used as the first nullifier if there is no nullifier emitted throughout the tx. */
  public salt: Fr,
) {}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/yarn-project/stdlib/src/tx/tx_request.ts#L15-L28" target="_blank" rel="noopener noreferrer">Source code: yarn-project/stdlib/src/tx/tx_request.ts#L15-L28</a></sub></sup>


Where:

- `origin` is the account contract where the transaction is initiated from.
- `functionData` contains the function selector and indicates whether the function is private or public.
- `argsHash` is the hash of the arguments of all of the calls to be executed. The complete set of arguments is passed to the PXE as part of the [TxExecutionRequest](https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/yarn-project/stdlib/src/tx/tx_execution_request.ts) and checked against this hash.
- `txContext` contains the chain id, version, and gas settings.

The `functionData` includes an `AppPayload`, which includes information about the application functions and arguments, and a `FeePayload`, which includes info about how to pay for the transaction.

An account contract validates that the transaction request has been authorized via its specified authorization mechanism, via the `is_valid_impl` function (e.g. [an ECDSA signature](https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/noir-projects/noir-contracts/contracts/account/ecdsa_k_account_contract/src/main.nr#L56-L57), generated [in JS](https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/yarn-project/accounts/src/ecdsa/ecdsa_k/account_contract.ts#L30)).

Transaction requests are simulated in the PXE in order to generate the necessary inputs for generating proofs. Once transactions are proven, a [transaction object](https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/yarn-project/stdlib/src/tx/tx.ts#L26) is created and can be sent to the network to be included in a block.

#### Contract Interaction Methods

Most transaction requests are created as interactions with specific contracts. The exception is transactions that deploy contracts. Here are the main methods for interacting with contracts related to transactions.

1. [`create`](#create)
2. [`simulate`](#simulate)
3. [`prove`](#prove)
4. [`send`](#send)

And fee utilities:

- [`estimateGas`](#estimategas)
- [`getFeeOptions`](#getfeeoptions)

##### `create`

```javascript title="create" showLineNumbers 
/**
 * Create a transaction execution request that represents this call, encoded and authenticated by the
 * user's wallet, ready to be simulated.
 * @param options - An optional object containing additional configuration for the transaction.
 * @returns A Promise that resolves to a transaction instance.
 */
public override async create(options: SendMethodOptions = {}): Promise<TxExecutionRequest> {
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/yarn-project/aztec.js/src/contract/contract_function_interaction.ts#L55-L63" target="_blank" rel="noopener noreferrer">Source code: yarn-project/aztec.js/src/contract/contract_function_interaction.ts#L55-L63</a></sub></sup>


##### `simulate`

```javascript title="simulate" showLineNumbers 
/**
 * Simulate a transaction and get its return values
 * Differs from prove in a few important ways:
 * 1. It returns the values of the function execution
 * 2. It supports `utility`, `private` and `public` functions
 *
 * @param options - An optional object containing additional configuration for the transaction.
 * @returns The result of the transaction as returned by the contract function.
 */
public async simulate<T extends SimulateMethodOptions>(options?: T): Promise<SimulationReturn<T['includeStats']>>;
// eslint-disable-next-line jsdoc/require-jsdoc
public async simulate(options: SimulateMethodOptions = {}): Promise<SimulationReturn<typeof options.includeStats>> {
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/yarn-project/aztec.js/src/contract/contract_function_interaction.ts#L105-L118" target="_blank" rel="noopener noreferrer">Source code: yarn-project/aztec.js/src/contract/contract_function_interaction.ts#L105-L118</a></sub></sup>


##### `prove`

```javascript title="prove" showLineNumbers 
/**
 * Proves a transaction execution request and returns a tx object ready to be sent.
 * @param options - optional arguments to be used in the creation of the transaction
 * @returns The resulting transaction
 */
public async prove(options: SendMethodOptions = {}): Promise<ProvenTx> {
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/yarn-project/aztec.js/src/contract/base_contract_interaction.ts#L55-L62" target="_blank" rel="noopener noreferrer">Source code: yarn-project/aztec.js/src/contract/base_contract_interaction.ts#L55-L62</a></sub></sup>


##### `send`

```javascript title="send" showLineNumbers 
/**
 * Sends a transaction to the contract function with the specified options.
 * This function throws an error if called on a utility function.
 * It creates and signs the transaction if necessary, and returns a SentTx instance,
 * which can be used to track the transaction status, receipt, and events.
 * @param options - An optional object containing 'from' property representing
 * the AztecAddress of the sender. If not provided, the default address is used.
 * @returns A SentTx instance for tracking the transaction status and information.
 */
public send(options: SendMethodOptions = {}): SentTx {
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/yarn-project/aztec.js/src/contract/base_contract_interaction.ts#L67-L78" target="_blank" rel="noopener noreferrer">Source code: yarn-project/aztec.js/src/contract/base_contract_interaction.ts#L67-L78</a></sub></sup>


##### `estimateGas`

```javascript title="estimateGas" showLineNumbers 
/**
 * Estimates gas for a given tx request and returns gas limits for it.
 * @param opts - Options.
 * @param pad - Percentage to pad the suggested gas limits by, if empty, defaults to 10%.
 * @returns Gas limits.
 */
public async estimateGas(
  opts?: Omit<SendMethodOptions, 'estimateGas'>,
): Promise<Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>> {
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/yarn-project/aztec.js/src/contract/base_contract_interaction.ts#L86-L96" target="_blank" rel="noopener noreferrer">Source code: yarn-project/aztec.js/src/contract/base_contract_interaction.ts#L86-L96</a></sub></sup>


##### `getFeeOptions`

```javascript title="getFeeOptions" showLineNumbers 
/**
 * Return fee options based on the user opts, estimating tx gas if needed.
 * @param executionPayload - Execution payload to get the fee for
 * @param fee - User-provided fee options.
 * @param options - Additional options for the transaction. They must faithfully represent the tx to get accurate fee estimates
 * @returns Fee options for the actual transaction.
 */
protected async getFeeOptions(
  executionPayload: ExecutionPayload,
  fee: UserFeeOptions = {},
  options: TxExecutionOptions,
): Promise<FeeOptions> {
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/yarn-project/aztec.js/src/contract/base_contract_interaction.ts#L125-L138" target="_blank" rel="noopener noreferrer">Source code: yarn-project/aztec.js/src/contract/base_contract_interaction.ts#L125-L138</a></sub></sup>


### Batch Transactions

Batched transactions are a way to send multiple transactions in a single call. They are created by the [`BatchCall` class in Aztec.js](https://github.com/AztecProtocol/aztec-packages/blob/v0.87.8/yarn-project/aztec.js/src/contract/batch_call.ts). This allows a batch of function calls from a single wallet to be sent as a single transaction through a wallet.

### Enabling Transaction Semantics

There are two kernel circuits in Aztec, the private kernel and the public kernel. Each circuit validates the correct execution of a particular function call.

A transaction is built up by generating proofs for multiple recursive iterations of kernel circuits. Each call in the call stack is modeled as new iteration of the kernel circuit and are managed by a [FIFO](<https://en.wikipedia.org/wiki/FIFO_(computing_and_electronics)>) queue containing pending function calls. There are two call stacks, one for private calls and one for public calls.

One iteration of a kernel circuit will pop a call off of the stack and execute the call. If the call triggers subsequent contract calls, these are pushed onto the stack.

Private kernel proofs are generated first. The transaction is ready to move to the next phase when the private call stack is empty.

The public kernel circuit takes in proof of a public/private kernel circuit with an empty private call stack, and operates recursively until the public call stack is also empty.

A transaction is considered complete when both call stacks are empty.

The only information leaked about the transaction is:

1. The number of private state updates triggered
2. The set of public calls generated

The addresses of all private calls are hidden from observers.
