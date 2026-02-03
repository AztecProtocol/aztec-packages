import { Fr } from '@aztec/foundation/curves/bn254';
import type { ContractArtifact, FunctionArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { PublicKeys } from '@aztec/stdlib/keys';
import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/stdlib/tx';

import type { Account } from '../account/account.js';
import type { Contract } from '../contract/contract.js';
import type { ContractBase } from '../contract/contract_base.js';
import {
  DeployMethod,
  type DeployOptionsWithoutWait,
  type RequestDeployOptions,
  type SimulateDeployOptions,
} from '../contract/deploy_method.js';
import type { FeePaymentMethodOption, InteractionWaitOptions } from '../contract/interaction_options.js';
import type { FeePaymentMethod } from '../fee/fee_payment_method.js';
import { AccountEntrypointMetaPaymentMethod } from './account_entrypoint_meta_payment_method.js';
import type { Wallet } from './index.js';

/**
 * Extended fee payment method option for account deployments that includes entrypoint wrapping options
 */
export type DeployAccountFeePaymentMethodOption = FeePaymentMethodOption & {
  /** Optional entrypoint-specific options for wrapping execution payloads */
  feeEntrypointOptions?: unknown;
};

/**
 * The configuration options for the request method. Omits the contractAddressSalt, since
 * for account contracts that is fixed in the constructor
 */
export type RequestDeployAccountOptions = Omit<RequestDeployOptions, 'contractAddressSalt' | 'fee'> & {
  /** Fee options specific to account deployment */
  fee?: DeployAccountFeePaymentMethodOption;
};

/**
 * Base configuration options for the send/prove methods without wait parameter. Omits:
 * - The contractAddressSalt, since for account contracts that is fixed in the constructor.
 * - UniversalDeployment flag, since account contracts are always deployed with it set to true
 */
export type DeployAccountOptionsWithoutWait = Omit<DeployOptionsWithoutWait, 'contractAddressSalt' | 'universalDeploy'>;

/**
 * The configuration options for the send/prove methods. Omits:
 * - The contractAddressSalt, since for account contracts that is fixed in the constructor.
 * - UniversalDeployment flag, since account contracts are always deployed with it set to true
 */
export type DeployAccountOptions<W extends InteractionWaitOptions = undefined> = DeployAccountOptionsWithoutWait & {
  /**
   * Whether to wait for the transaction to be mined.
   * - undefined (default): wait with default options and return TxReceipt
   * - WaitOpts object: wait with custom options and return TxReceipt
   * - false: return txHash immediately without waiting
   */
  wait?: W;
};

/**
 * The configuration options for the simulate method. Omits the contractAddressSalt, since
 * for account contracts that is fixed in the constructor
 */
export type SimulateDeployAccountOptions = Omit<SimulateDeployOptions, 'contractAddressSalt'>;

/**
 * Modified version of the DeployMethod used to deploy account contracts. Supports deploying
 * contracts that can pay for their own fee, plus some preconfigured options to avoid errors.
 */
export class DeployAccountMethod<TContract extends ContractBase = Contract> extends DeployMethod<TContract> {
  constructor(
    publicKeys: PublicKeys,
    wallet: Wallet,
    artifact: ContractArtifact,
    postDeployCtor: (instance: ContractInstanceWithAddress, wallet: Wallet) => TContract,
    private salt: Fr,
    private account: Account,
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
   * @param feeEntrypointOptions - Optional entrypoint-specific options for wrapping. If not provided, will be auto-computed based on the payment method.
   * @returns A FeePaymentMethod that routes the original one through the account's entrypoint (AccountEntrypointMetaPaymentMethod)
   */
  private getSelfFeePaymentMethod(originalPaymentMethod?: FeePaymentMethod, feeEntrypointOptions?: any) {
    if (!this.address) {
      throw new Error('Instance is not yet constructed. This is a bug!');
    }
    return new AccountEntrypointMetaPaymentMethod(this.account, originalPaymentMethod, feeEntrypointOptions);
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
      const feePaymentMethod = this.getSelfFeePaymentMethod(opts?.fee?.paymentMethod, opts?.fee?.feeEntrypointOptions);
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

  override convertDeployOptionsToRequestOptions(options: DeployAccountOptionsWithoutWait): RequestDeployOptions {
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
