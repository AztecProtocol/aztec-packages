import { DefaultMultiCallEntrypoint } from '@aztec/entrypoints/multicall';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { ContractArtifact, FunctionArtifact } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { PublicKeys } from '@aztec/stdlib/keys';
import { type Capsule, ExecutionPayload, type HashedValues, mergeExecutionPayloads } from '@aztec/stdlib/tx';

import type { Account } from '../account/account.js';
import type { Contract } from '../contract/contract.js';
import type { ContractBase } from '../contract/contract_base.js';
import {
  type DeployOptions,
  type DeployOptionsWithoutWait,
  type RequestDeployOptions,
  type SimulateDeployOptions,
  UniversalDeployMethod,
} from '../contract/deploy_method.js';
import {
  type FeePaymentMethodOption,
  type InteractionWaitOptions,
  NO_FROM,
  type NoFrom,
  type ProfileInteractionOptions,
  type SendInteractionOptionsWithoutWait,
} from '../contract/interaction_options.js';
import type { FeePaymentMethod } from '../fee/fee_payment_method.js';
import { AccountEntrypointMetaPaymentMethod } from './account_entrypoint_meta_payment_method.js';
import type { ProfileOptions, SendOptions, SimulateOptions, Wallet } from './index.js';

/**
 * Extended fee payment method option for account deployments that includes entrypoint wrapping options
 */
export type DeployAccountFeePaymentMethodOption = FeePaymentMethodOption & {
  /** Optional entrypoint-specific options for wrapping execution payloads */
  feeEntrypointOptions?: unknown;
};

/**
 * The configuration options for the request method.
 */
export type RequestDeployAccountOptions = Omit<RequestDeployOptions, 'fee'> & {
  /** Fee options specific to account deployment */
  fee?: DeployAccountFeePaymentMethodOption;
  /**
   * Sender of the request. When NO_FROM, the to-be-deployed account pays for its own
   * deployment (self-paid deploy) and the payload is wrapped through the multicall entrypoint.
   */
  from?: AztecAddress | NoFrom;
};

/**
 * The configuration options for the send/prove methods.
 */
export type DeployAccountOptions<W extends InteractionWaitOptions = undefined> = DeployOptionsWithoutWait & {
  /**
   * Whether to wait for the transaction to be mined.
   * - undefined (default): wait with default options and return TxReceipt
   * - WaitOpts object: wait with custom options and return TxReceipt
   * - false: return txHash immediately without waiting
   */
  wait?: W;
};

/**
 * The configuration options for the simulate method.
 */
export type SimulateDeployAccountOptions = SimulateDeployOptions;

/** Fields from any interaction option shape that `DeployAccountMethod.prepareDeployOptions` reads or sets. */
type DeployAccountInteractionOptions = Pick<
  SendInteractionOptionsWithoutWait,
  'additionalScopes' | 'from' | 'sendMessagesAs'
>;

/**
 * Modified version of the DeployMethod used to deploy account contracts. Supports deploying
 * contracts that can pay for their own fee, plus some preconfigured options to avoid errors.
 */
export class DeployAccountMethod<TContract extends ContractBase = Contract> extends UniversalDeployMethod<TContract> {
  constructor(
    publicKeys: PublicKeys,
    wallet: Wallet,
    artifact: ContractArtifact,
    postDeployCtor: (instance: ContractInstanceWithAddress, wallet: Wallet) => TContract,
    salt: Fr,
    immutablesHash: Fr,
    private account: Account,
    args: any[] = [],
    constructorNameOrArtifact?: string | FunctionArtifact,
    authWitnesses: AuthWitness[] = [],
    capsules: Capsule[] = [],
    extraHashedArgs: HashedValues[] = [],
  ) {
    super(
      wallet,
      { artifact, postDeployCtor, args, constructorNameOrArtifact },
      // Account contracts are always deployed universally.
      { salt, universalDeploy: true, publicKeys, immutablesHash },
      { authWitnesses, capsules, extraHashedArgs },
    );
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
  private async getSelfFeePaymentMethod(originalPaymentMethod?: FeePaymentMethod, feeEntrypointOptions?: any) {
    const chainInfo = await this.wallet.getChainInfo();
    return new AccountEntrypointMetaPaymentMethod(this.account, chainInfo, originalPaymentMethod, feeEntrypointOptions);
  }

  /**
   * Returns the execution payload that allows this operation to happen on chain.
   * For self-deployments (from === NO_FROM), the payload is wrapped through the
   * multicall entrypoint on the app side so the wallet can execute it directly.
   * @param opts - Configuration options.
   * @returns The execution payload for this operation
   */
  public override async request(opts?: RequestDeployAccountOptions): Promise<ExecutionPayload> {
    const optionsWithDefaults: RequestDeployOptions = {
      ...opts,
      skipClassPublication: opts?.skipClassPublication ?? true,
      skipInstancePublication: opts?.skipInstancePublication ?? true,
      skipInitialization: opts?.skipInitialization ?? false,
    };
    // Override the fee to undefined, since we'll replace it
    const deploymentExecutionPayload = await super.request({ ...optionsWithDefaults, fee: undefined });
    const executionPayloads = [deploymentExecutionPayload];
    // If this is a self-paid deployment (the to-be-deployed account pays for its own deploy),
    // wrap the payload through the multicall entrypoint after attaching the fee.
    if (opts?.from === NO_FROM) {
      const feePaymentMethod = await this.getSelfFeePaymentMethod(
        opts?.fee?.paymentMethod,
        opts?.fee?.feeEntrypointOptions,
      );
      const feeExecutionPayload = await feePaymentMethod.getExecutionPayload();
      // Notice they are reversed (fee payment usually goes first):
      // this is because we need to construct the contract BEFORE it can pay for its own fee
      executionPayloads.push(feeExecutionPayload);
      // Wrap the merged payload through the multicall entrypoint,
      // producing a single-call payload that DefaultEntrypoint can execute directly.
      const multicall = new DefaultMultiCallEntrypoint();
      const chainInfo = await this.wallet.getChainInfo();
      return multicall.wrapExecutionPayload(mergeExecutionPayloads(executionPayloads), chainInfo);
    } else {
      const feeExecutionPayload = opts?.fee?.paymentMethod
        ? await opts.fee.paymentMethod.getExecutionPayload()
        : undefined;
      if (feeExecutionPayload) {
        executionPayloads.unshift(feeExecutionPayload);
      }
      return mergeExecutionPayloads(executionPayloads);
    }
  }

  protected override convertDeployOptionsToSendOptions<W extends InteractionWaitOptions>(
    options: DeployOptions<W>,
  ): SendOptions<W> {
    return super.convertDeployOptionsToSendOptions(this.prepareDeployOptions(options));
  }

  protected override convertDeployOptionsToSimulateOptions(options: SimulateDeployOptions): SimulateOptions {
    return super.convertDeployOptionsToSimulateOptions(this.prepareDeployOptions(options));
  }

  protected override convertDeployOptionsToProfileOptions(
    options: DeployOptionsWithoutWait & ProfileInteractionOptions,
  ): ProfileOptions {
    return super.convertDeployOptionsToProfileOptions(this.prepareDeployOptions(options));
  }

  /**
   * Augments deploy options so that the PXE has the context it needs to simulate/prove the deploy.
   *
   * - Injects the contract's own address into scopes so the constructor can access its own keys.
   * - When `from === NO_FROM` (self-paid deploy), supplies the to-be-deployed address as `sendMessagesAs`. Without
   *   this, fee-payment calls would have no sender for message tagging, and any private log they emit would fail
   *   the "Sender for tags is not set" assertion.
   *
   * Note: this reads the cached instance synchronously via `getCachedInstance()`. Because every code path that
   * calls `prepareDeployOptions` (send/simulate/profile) flows through `request()` first, which calls
   * `getInstance()`, the cache is always populated by the time we get here.
   *
   * @param options - The deploy options to augment.
   */
  private prepareDeployOptions<T extends DeployAccountInteractionOptions>(options: T): T {
    const { address } = this.getCachedInstanceOrThrow();
    const existing = options.additionalScopes ?? [];
    const sendMessagesAs = options.sendMessagesAs ?? (options.from === NO_FROM ? address : undefined);
    return { ...options, additionalScopes: [...existing, address], sendMessagesAs };
  }

  /**
   * Augments this DeployAccountMethod with additional metadata, such as authWitnesses and capsules.
   * @param options - An object containing the metadata to add to the interaction
   * @returns A new DeployAccountMethod with the added metadata
   */
  public override with({
    authWitnesses = [],
    capsules = [],
    extraHashedArgs = [],
  }: {
    /** The authWitnesses to add to the deployment */
    authWitnesses?: AuthWitness[];
    /** The capsules to add to the deployment */
    capsules?: Capsule[];
    /** The extra hashed args to add to the deployment */
    extraHashedArgs?: HashedValues[];
  }): DeployAccountMethod<TContract> {
    return new DeployAccountMethod(
      this.publicKeys,
      this.wallet,
      this.artifact,
      this.postDeployCtor,
      this.salt,
      this.immutablesHash,
      this.account,
      this.args,
      this.constructorArtifact?.name,
      this.authWitnesses.concat(authWitnesses),
      this.capsules.concat(capsules),
      this.extraHashedArgs.concat(extraHashedArgs),
    );
  }
}
