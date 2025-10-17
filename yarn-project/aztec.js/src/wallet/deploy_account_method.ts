import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/entrypoints/payload';
import { Fr } from '@aztec/foundation/fields';
import type { ContractArtifact, FunctionArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { PublicKeys } from '@aztec/stdlib/keys';

import type { Contract } from '../contract/contract.js';
import type { ContractBase } from '../contract/contract_base.js';
import {
  DeployMethod,
  type DeployOptions,
  type RequestDeployOptions,
  type SimulateDeployOptions,
} from '../contract/deploy_method.js';
import type { FeePaymentMethod } from '../fee/fee_payment_method.js';
import { AccountEntrypointMetaPaymentMethod } from './account_entrypoint_meta_payment_method.js';
import type { Wallet } from './index.js';

/**
 * The configuration options for the request method. Omits the contractAddressSalt, since
 * for account contracts that is fixed in the constructor
 */
export type RequestDeployAccountOptions = Omit<RequestDeployOptions, 'contractAddressSalt'>;

/**
 * The configuration options for the send/prove methods. Omits:
 * - The contractAddressSalt, since for account contracts that is fixed in the constructor.
 * - UniversalDeployment flag, since account contracts are always deployed with it set to true
 */
export type DeployAccountOptions = Omit<DeployOptions, 'contractAddressSalt' | 'universalDeploy'>;

/**
 * The configuration options for the simulate method. Omits the contractAddressSalt, since
 * for account contracts that is fixed in the constructor
 */
export type SimulateDeployAccountOptions = Omit<SimulateDeployOptions, 'contractAddressSalt'>;

/**
 * Specialized deployment method for account contracts with support for self-paying deployments.
 *
 * @remarks
 * DeployAccountMethod extends DeployMethod with account-specific features:
 *
 * - **Self-Paying Deployment**: Account contracts can pay for their own deployment fees
 * - **Universal Deployment**: Always deployed as universally deployable (sender-independent address)
 * - **Preconfigured Options**: Sensible defaults for account deployment
 *
 * Account contracts in Aztec implement account abstraction, allowing custom authentication
 * and transaction validation logic. This deployment method handles the special requirements
 * of deploying such contracts, including the ability for an account to pay its own deployment
 * fees through the account's entrypoint.
 *
 * Key differences from regular DeployMethod:
 * 1. Always uses universal deployment (sender-independent addresses)
 * 2. Can route fee payment through the account's entrypoint
 * 3. Defaults to skipping class and instance publication for privacy
 *
 * @typeParam TContract - The account contract type being deployed
 *
 * @example
 * ```typescript
 * // Deploy account contract with external fee payer
 * const manager = await AccountManager.create(wallet, secretKey, accountContract);
 * const deployMethod = await manager.getDeployMethod();
 *
 * const tx = deployMethod.send({
 *   from: deployerAddress, // External deployer pays fees
 * });
 * await tx.deployed();
 * ```
 *
 * @example
 * ```typescript
 * // Self-paying deployment (account pays for itself)
 * const manager = await AccountManager.create(wallet, secretKey, accountContract);
 * const deployMethod = await manager.getDeployMethod();
 *
 * // Fund the account address with FeeJuice first
 * const accountAddress = manager.address;
 * await fundAccountWithFeeJuice(accountAddress);
 *
 * // Account deploys and pays for itself
 * const tx = deployMethod.send({
 *   from: accountAddress,
 *   fee: { paymentMethod: new FeeJuicePaymentMethod(accountAddress) }
 * });
 * await tx.deployed();
 * ```
 *
 * @example
 * ```typescript
 * // Deploy with custom options
 * const deployMethod = await manager.getDeployMethod();
 * const tx = deployMethod.send({
 *   from: deployerAddress,
 *   skipClassPublication: false, // Publish class
 *   skipInstancePublication: false, // Publish instance
 *   skipInitialization: false, // Call constructor
 * });
 * ```
 */
export class DeployAccountMethod<TContract extends ContractBase = Contract> extends DeployMethod<TContract> {
  constructor(
    publicKeys: PublicKeys,
    wallet: Wallet,
    artifact: ContractArtifact,
    postDeployCtor: (address: AztecAddress, wallet: Wallet) => Promise<TContract>,
    private salt: Fr,
    args: any[] = [],
    constructorNameOrArtifact?: string | FunctionArtifact,
  ) {
    super(publicKeys, wallet, artifact, postDeployCtor, args, constructorNameOrArtifact);
  }

  /**
   * Returns a FeePaymentMethod that routes the original one provided as an argument
   * through the account's entrypoint. This allows an account contract to pay
   * for its own deployment and initialization.
   *
   * For more details on how the fee payment routing works see documentation of AccountEntrypointMetaPaymentMethod class.
   *
   * @param originalPaymentMethod - originalPaymentMethod The original payment method to be wrapped.
   * @returns A FeePaymentMethod that routes the original one through the account's entrypoint (AccountEntrypointMetaPaymentMethod)
   */
  private getSelfFeePaymentMethod(originalPaymentMethod?: FeePaymentMethod) {
    if (!this.address) {
      throw new Error('Instance is not yet constructed. This is a bug!');
    }
    return new AccountEntrypointMetaPaymentMethod(
      this.wallet,
      this.artifact,
      'entrypoint',
      this.address,
      originalPaymentMethod,
    );
  }

  /**
   * Returns the execution payload that allows this operation to happen on chain.
   * @param opts - Configuration options.
   * @returns The execution payload for this operation
   */
  public override async request(opts?: RequestDeployAccountOptions): Promise<ExecutionPayload> {
    const optionsWithDefaults: RequestDeployOptions = {
      ...opts,
      // Regardless of whom sends the transaction, account contracts
      // are always deployed as universalDeployment: true
      deployer: undefined,
      contractAddressSalt: new Fr(this.salt),
      skipClassPublication: opts?.skipClassPublication ?? true,
      skipInstancePublication: opts?.skipInstancePublication ?? true,
      skipInitialization: opts?.skipInitialization ?? false,
    };
    // Override the fee to undefined, since we'll replace it
    const deploymentExecutionPayload = await super.request({ ...optionsWithDefaults, fee: undefined });
    const executionPayloads = [deploymentExecutionPayload];
    // If this is a self-deployment, manage the fee accordingly
    if (opts?.deployer?.equals(AztecAddress.ZERO)) {
      const feePaymentMethod = this.getSelfFeePaymentMethod(opts?.fee?.paymentMethod);
      const feeExecutionPayload = await feePaymentMethod.getExecutionPayload();
      // Notice they are reversed (fee payment usually goes first):
      // this is because we need to construct the contract BEFORE it can pay for its own fee
      executionPayloads.push(feeExecutionPayload);
    } else {
      const feeExecutionPayload = opts?.fee?.paymentMethod
        ? await opts.fee.paymentMethod.getExecutionPayload()
        : undefined;
      if (feeExecutionPayload) {
        executionPayloads.unshift(feeExecutionPayload);
      }
    }
    return mergeExecutionPayloads(executionPayloads);
  }

  override convertDeployOptionsToRequestOptions(options: DeployOptions): RequestDeployOptions {
    return {
      ...options,
      // Deployer is handled in the request method and forcibly set to undefined,
      // since our account contracts are created with universalDeployment: true
      // We need to forward it though, because depending on the deployer we have to assemble
      // The fee payment method one way or another
      deployer: options.from,
    };
  }
}
