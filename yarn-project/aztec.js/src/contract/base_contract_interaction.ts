import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import { createLogger } from '@aztec/foundation/log';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { Capsule, TxProvingResult } from '@aztec/stdlib/tx';

import type { Wallet } from '../wallet/wallet.js';
import { type RequestInteractionOptions, type SendInteractionOptions, toSendOptions } from './interaction_options.js';
import { ProvenTx } from './proven_tx.js';
import { SentTx } from './sent_tx.js';

/**
 * Abstract base class for all contract interactions (deployments, function calls, batches).
 *
 * @remarks
 * BaseContractInteraction provides the common foundation for interacting with contracts,
 * implementing the standard lifecycle: create → simulate → prove → send.
 *
 * All contract interactions follow this pattern:
 * 1. **Request**: Create an execution payload describing the operation
 * 2. **Simulate**: Execute locally to get return values and gas estimates (optional)
 * 3. **Prove**: Generate a cryptographic proof of execution (optional)
 * 4. **Send**: Submit the transaction to the network
 *
 * This class handles:
 * - Authorization witness management
 * - Capsule (bytecode) attachment
 * - Transaction proving and sending
 * - Logging and error handling
 *
 * Concrete implementations must provide the `request()` method to generate the
 * execution payload for their specific operation type (deployment, function call, etc.).
 *
 * @example
 * ```typescript
 * // Typical usage through concrete classes
 * const interaction = contract.methods.transfer(recipient, amount);
 *
 * // Create execution request
 * const request = await interaction.request();
 *
 * // Simulate (optional)
 * const simulation = await interaction.simulate({ from: sender });
 *
 * // Send transaction
 * const tx = interaction.send({ from: sender });
 * const receipt = await tx.wait();
 * ```
 *
 * @example
 * ```typescript
 * // Prove without sending
 * const provenTx = await interaction.prove({ from: sender });
 * // Later, send the proven transaction
 * const txHash = await wallet.sendTx(provenTx.tx);
 * ```
 */
export abstract class BaseContractInteraction {
  protected log = createLogger('aztecjs:contract_interaction');

  constructor(
    protected wallet: Wallet,
    protected authWitnesses: AuthWitness[] = [],
    protected capsules: Capsule[] = [],
  ) {}

  /**
   * Returns an execution request that represents this operation.
   * Can be used as a building block for constructing batch requests.
   * @param options - An optional object containing additional configuration for the transaction.
   * @returns An execution request wrapped in promise.
   */
  public abstract request(options?: RequestInteractionOptions): Promise<ExecutionPayload>;

  /**
   * Creates a transaction execution request, simulates and proves it. Differs from .prove in
   * that its result does not include the wallet nor the composed tx object, but only the proving result.
   * This object can then be used to either create a ProvenTx ready to be sent, or directly send the transaction.
   * @param options - optional arguments to be used in the creation of the transaction
   * @returns The proving result.
   */
  protected async proveInternal(options: SendInteractionOptions): Promise<TxProvingResult> {
    const executionPayload = await this.request(options);
    const proveOptions = await toSendOptions(options);
    return await this.wallet.proveTx(executionPayload, proveOptions);
  }

  // docs:start:prove
  /**
   * Proves a transaction execution request and returns a tx object ready to be sent.
   * @param options - optional arguments to be used in the creation of the transaction
   * @returns The resulting transaction
   */
  public async prove(options: SendInteractionOptions): Promise<ProvenTx> {
    // docs:end:prove
    const txProvingResult = await this.proveInternal(options);
    return new ProvenTx(
      this.wallet,
      await txProvingResult.toTx(),
      txProvingResult.getOffchainEffects(),
      txProvingResult.stats,
    );
  }

  // docs:start:send
  /**
   * Sends a transaction to the contract function with the specified options.
   * This function throws an error if called on a utility function.
   * It creates and signs the transaction if necessary, and returns a SentTx instance,
   * which can be used to track the transaction status, receipt, and events.
   * @param options - An optional object containing 'from' property representing
   * the AztecAddress of the sender. If not provided, the default address is used.
   * @returns A SentTx instance for tracking the transaction status and information.
   */
  public send(options: SendInteractionOptions): SentTx {
    // docs:end:send
    const sendTx = async () => {
      const txProvingResult = await this.proveInternal(options);
      return this.wallet.sendTx(await txProvingResult.toTx());
    };
    return new SentTx(this.wallet, sendTx);
  }
}
