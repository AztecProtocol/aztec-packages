---
title: Transactions
sidebar_position: 3
tags: [protocol]
description: Comprehensive guide to the Aztec transaction lifecycle, covering private execution, PXE interactions, kernel circuits, and the step-by-step process from user request to L1 settlement.
references: ["noir-projects/noir-contracts/contracts/account/ecdsa_k_account_contract/*", "yarn-project/aztec.js/src/contract/*", "yarn-project/stdlib/src/tx/*"]
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
4. **The sequencer processes the transaction** – The pseudorandomly-selected sequencer validates the transaction proofs along with required inputs for this private transfer. The sequencer also executes public functions and updates state: public state is updated by directly modifying entries in the sparse Merkle tree, while private state is updated by adding the newly created note commitments and nullifiers to the indexed Merkle trees. The sequencer then computes the new state root and posts the block to L1.
5. **The transaction settles to L1** – The block is posted to L1, and later, provers submit epoch proofs to the verifier contract on Ethereum. Once the epoch proof is verified, the state transitions are considered final and the private transfer has settled.

### Detailed Diagram

The following diagram provides a more detailed overview of the transaction execution process, highlighting three different types of transaction execution: contract deployments, private transactions, and public transactions.

<Image img={require("@site/static/img/local_network_sending_a_tx.png")} />

See the page on [call types](./call_types.md) for more context on transaction execution.

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
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/yarn-project/stdlib/src/tx/tx_request.ts#L15-L28" target="_blank" rel="noopener noreferrer">Source code: yarn-project/stdlib/src/tx/tx_request.ts#L15-L28</a></sub></sup>


Where:

- `origin` is the account contract where the transaction is initiated from.
- `argsHash` is the hash of the arguments of the entrypoint call. The complete set of arguments is passed to the PXE as part of the `TxExecutionRequest` and checked against this hash.
- `txContext` contains the chain id, version, and gas settings.
- `functionData` contains the function selector and indicates whether the function is private or public.
- `salt` is used to make the transaction request hash difficult to predict. The hash is used as the first nullifier if no nullifier is emitted throughout the transaction.

The `TxExecutionRequest` class:

```javascript title="tx_execution_request_class" showLineNumbers 
export class TxExecutionRequest {
  constructor(
    /**
     * Sender.
     */
    public origin: AztecAddress,
    /**
     * Selector of the function to call.
     */
    public functionSelector: FunctionSelector,
    /**
     * The hash of arguments of first call to be executed (usually account entrypoint).
     * @dev This hash is a pointer to `argsOfCalls` unordered array.
     */
    public firstCallArgsHash: Fr,
    /**
     * Transaction context.
     */
    public txContext: TxContext,
    /**
     * An unordered array of packed arguments for each call in the transaction.
     * @dev These arguments are accessed in Noir via oracle and constrained against the args hash. The length of
     * the array is equal to the number of function calls in the transaction (1 args per 1 call).
     */
    public argsOfCalls: HashedValues[],
    /**
     * Transient authorization witnesses for authorizing the execution of one or more actions during this tx.
     * These witnesses are not expected to be stored in the local witnesses database of the PXE.
     */
    public authWitnesses: AuthWitness[],
    /**
     * Read-only data passed through the oracle calls during this tx execution.
     */
    public capsules: Capsule[],
    /**
     * A salt to make the tx request hash difficult to predict.
     * The hash is used as the first nullifier if there is no nullifier emitted throughout the tx.
     */
    public salt = Fr.random(),
  ) {}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/yarn-project/stdlib/src/tx/tx_execution_request.ts#L23-L64" target="_blank" rel="noopener noreferrer">Source code: yarn-project/stdlib/src/tx/tx_execution_request.ts#L23-L64</a></sub></sup>


An account contract validates that the transaction request has been authorized via its specified authorization mechanism, via the `is_valid_impl` function. Here is an example using an ECDSA signature:

```rust title="is_valid_impl" showLineNumbers 
#[contract_library_method]
fn is_valid_impl(context: &mut PrivateContext, outer_hash: Field) -> bool {
    // Load public key from storage
    let storage = Storage::init(context);
    let public_key = storage.signing_public_key.get_note();

    // Safety: The witness is only used as a "magical value" that makes the signature verification below pass.
    // Hence it's safe.
    let signature: [u8; 64] = unsafe { get_auth_witness_as_bytes(outer_hash) };

    // Verify payload signature using Ethereum's signing scheme
    // Note that noir expects the hash of the message/challenge as input to the ECDSA verification.
    let outer_hash_bytes: [u8; 32] = outer_hash.to_be_bytes();
    let hashed_message: [u8; 32] = sha256::digest(outer_hash_bytes);
    std::ecdsa_secp256k1::verify_signature(public_key.x, public_key.y, signature, hashed_message)
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/noir-projects/noir-contracts/contracts/account/ecdsa_k_account_contract/src/main.nr#L55-L72" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/account/ecdsa_k_account_contract/src/main.nr#L55-L72</a></sub></sup>


Transaction requests are simulated in the PXE in order to generate the necessary inputs for generating proofs. Once transactions are proven, a `Tx` object is created and can be sent to the network to be included in a block:

```javascript title="tx_class" showLineNumbers 
export class Tx extends Gossipable {
  static override p2pTopic = TopicType.tx;

  private calldataMap: Map<string, Fr[]> | undefined;

  constructor(
    /**
     * Identifier of the tx.
     * It's a hash of the public inputs of the tx's proof.
     * This claimed hash is reconciled against the tx's public inputs (`this.data`) in data_validator.ts.
     */
    public readonly txHash: TxHash,
    /**
     * Output of the private kernel circuit for this tx.
     */
    public readonly data: PrivateKernelTailCircuitPublicInputs,
    /**
     * Proof from the private kernel circuit.
     */
    public readonly chonkProof: ChonkProof,
    /**
     * Contract class log fields emitted from the tx.
     * Their order should match the order of the log hashes returned from `this.data.getNonEmptyContractClassLogsHashes`.
     * This claimed data is reconciled against a hash of this data (that is contained within
     * the tx's public inputs (`this.data`)), in data_validator.ts.
     */
    public readonly contractClassLogFields: ContractClassLogFields[],
    /**
     * An array of calldata for the enqueued public function calls and the teardown function call.
     * This claimed data is reconciled against hashes of this data (that are contained within
     * the tx's public inputs (`this.data`)), in data_validator.ts.
     */
    public readonly publicFunctionCalldata: HashedValues[],
  ) {
    super();
  }
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/yarn-project/stdlib/src/tx/tx.ts#L39-L76" target="_blank" rel="noopener noreferrer">Source code: yarn-project/stdlib/src/tx/tx.ts#L39-L76</a></sub></sup>


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
public async simulate(
  options: SimulateInteractionOptions = {} as SimulateInteractionOptions,
): Promise<SimulationResult> {
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/yarn-project/aztec.js/src/contract/contract_function_interaction.ts#L114-L129" target="_blank" rel="noopener noreferrer">Source code: yarn-project/aztec.js/src/contract/contract_function_interaction.ts#L114-L129</a></sub></sup>


##### `send`

```javascript title="send" showLineNumbers 
/**
 * Sends a transaction to the contract function with the specified options.
 * By default, waits for the transaction to be mined and returns the receipt (or custom type).
 * @param options - An object containing 'from' property representing
 * the AztecAddress of the sender, optional fee configuration, and optional wait settings
 * @returns TReturn (if wait is undefined/WaitOpts) or TxHash (if wait is NO_WAIT)
 */
// Overload for when wait is not specified at all - returns { receipt: TReturn, offchainEffects }
public send<TReturn = TxReceipt>(options: SendInteractionOptionsWithoutWait): Promise<TxSendResultMined<TReturn>>;
// Generic overload for explicit wait values
// eslint-disable-next-line jsdoc/require-jsdoc
public send<TReturn = TxReceipt, W extends InteractionWaitOptions = undefined>(
  options: SendInteractionOptions<W>,
): Promise<SendReturn<W, TReturn>>;
// eslint-disable-next-line jsdoc/require-jsdoc
public async send<TReturn = TxReceipt>(
  options: SendInteractionOptions<InteractionWaitOptions>,
): Promise<SendReturn<typeof options.wait, TReturn>> {
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/yarn-project/aztec.js/src/contract/base_contract_interaction.ts#L37-L56" target="_blank" rel="noopener noreferrer">Source code: yarn-project/aztec.js/src/contract/base_contract_interaction.ts#L37-L56</a></sub></sup>


### Batch Transactions

Batched transactions are a way to send multiple transactions in a single call. They are created by the `BatchCall` class in Aztec.js. This allows a batch of function calls from a single wallet to be sent as a single transaction through a wallet.

```javascript title="batch_call_class" showLineNumbers 
export class BatchCall extends BaseContractInteraction {
  constructor(
    wallet: Wallet,
    protected interactions: (BaseContractInteraction | ExecutionPayload)[],
    private extraHashedArgs: HashedValues[] = [],
  ) {
    super(wallet);
  }
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/yarn-project/aztec.js/src/contract/batch_call.ts#L17-L26" target="_blank" rel="noopener noreferrer">Source code: yarn-project/aztec.js/src/contract/batch_call.ts#L17-L26</a></sub></sup>


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

- Learn about [accounts](./accounts/index.md) and how they authorize transactions
- Understand [state management](./state_management.md) and how transaction effects are stored
- Explore the [PXE](./pxe/index.md) in more detail
- Understand the [performance impact of kernel circuits](./advanced/circuits/private_kernel.md#performance-impact) on proving time
