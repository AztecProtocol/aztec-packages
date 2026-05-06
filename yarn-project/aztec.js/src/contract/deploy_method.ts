import { Fr } from '@aztec/foundation/curves/bn254';
import { type ContractArtifact, type FunctionAbi, type FunctionArtifact, getInitializer } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractInstanceWithAddress,
  computePartialAddress,
  getContractClassFromArtifact,
  getContractInstanceFromInstantiationParams,
} from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';
import { type Capsule, HashedValues, type TxProfileResult, type TxReceipt } from '@aztec/stdlib/tx';
import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/stdlib/tx';

import { publishContractClass } from '../deployment/publish_class.js';
import { publishInstance } from '../deployment/publish_instance.js';
import type { ProfileOptions, SendOptions, SimulateOptions, Wallet } from '../wallet/wallet.js';
import { BaseContractInteraction } from './base_contract_interaction.js';
import type { ContractBase } from './contract_base.js';
import { ContractFunctionInteraction } from './contract_function_interaction.js';
import { getGasLimits } from './get_gas_limits.js';
import {
  type InteractionWaitOptions,
  NO_FROM,
  NO_WAIT,
  type NoWait,
  type OffchainOutput,
  type ProfileInteractionOptions,
  type RequestInteractionOptions,
  type SendInteractionOptionsWithoutWait,
  type SimulationInteractionFeeOptions,
  type SimulationResult,
  type TxSendResultImmediate,
  extractOffchainOutput,
  toProfileOptions,
  toSendOptions,
  toSimulateOptions,
} from './interaction_options.js';
import type { WaitOpts } from './wait_opts.js';

/**
 * Inputs that determine the contract's deployment address.
 *
 * `salt` and `publicKeys` are optional and default to a random Fr and `PublicKeys.default()` respectively.
 *
 * `deployer` and `universalDeploy` are mutually exclusive and both optional:
 * - If neither is supplied, the deployer is locked lazily on the first `send` / `simulate` /
 *   `profile` call from `options.from` (NO_FROM/undefined → universal). This preserves the
 *   ergonomics of `MyContract.deploy(wallet, ...args).send({ from: alice })`.
 * - If `deployer` or `universalDeploy: true` is supplied, the deployer is locked at construction.
 *
 * Once locked, the deployer cannot change. Subsequent calls with a `from` that would imply a different
 * deployer throw — except when locked to `AztecAddress.ZERO` (universal), which is compatible with any
 * sender.
 */
export type DeployInstantiationOptions = {
  /** Salt used to derive the contract address. Defaults to a random Fr. */
  salt?: Fr;
  /**
   * Deployer address mixed into the address preimage. Mutually exclusive with `universalDeploy`.
   */
  deployer?: AztecAddress;
  /**
   * If true, the contract is deployed universally (deployer = AztecAddress.ZERO in the address preimage).
   * Mutually exclusive with `deployer`.
   */
  universalDeploy?: boolean;
  /** Public keys mixed into the address. Defaults to PublicKeys.default(). */
  publicKeys?: PublicKeys;
};

/**
 * Options for deploying a contract on the Aztec network.
 * Controls publication and registration policy for this deployment. Address-affecting parameters
 * (salt, deployer, publicKeys, constructor and args) are passed at construction time.
 */
export type RequestDeployOptions = RequestInteractionOptions & {
  /** Skip contract class publication. */
  skipClassPublication?: boolean;
  /** Skip publication, instead just privately initialize the contract. */
  skipInstancePublication?: boolean;
  /** Skip contract initialization. */
  skipInitialization?: boolean;
  /** Skip contract registration in the wallet */
  skipRegistration?: boolean;
};

/**
 * Base deployment options without wait parameter.
 */
export type DeployOptionsWithoutWait = RequestDeployOptions &
  Pick<SendInteractionOptionsWithoutWait, 'from' | 'fee' | 'additionalScopes'>;

/**
 * Extends the deployment options with the required parameters to send the transaction.
 */
export type DeployOptions<W extends InteractionWaitOptions = undefined> = DeployOptionsWithoutWait & {
  /**
   * Options for waiting for the transaction to be mined.
   * - undefined (default): wait with default options and return the contract instance
   * - WaitOpts: wait with custom options
   * - NO_WAIT: return TxHash immediately without waiting
   */
  wait?: W;
};

/**
 * Options for simulating the deployment of a contract
 * Allows skipping certain validations and computing gas estimations
 */
export type SimulateDeployOptions = Omit<DeployOptionsWithoutWait, 'fee'> & {
  /** The fee options for the transaction. */
  fee?: SimulationInteractionFeeOptions;
  /** Simulate without checking for the validity of the resulting transaction,
   * e.g. whether it emits any existing nullifiers. */
  skipTxValidation?: boolean;
  /** Whether to ensure the fee payer is not empty and has enough balance to pay for the fee. */
  skipFeeEnforcement?: boolean;
  /** Whether to include metadata such as offchain effects and performance statistics
   * (e.g. timing information of the different circuits and oracles) in
   * the simulation result, instead of just the return value of the function */
  includeMetadata?: boolean;
};

/** Result of deploying a contract when waiting for mining (default case). */
export type DeployResultMined<TContract extends ContractBase> = {
  /** The deployed contract instance. */
  contract: TContract;
  /** The deployed contract instance with address and metadata. */
  instance: ContractInstanceWithAddress;
  /** The deploy transaction receipt. */
  receipt: TxReceipt;
} & OffchainOutput;

/** Conditional return type for deploy based on wait options. */
export type DeployReturn<TContract extends ContractBase, W extends InteractionWaitOptions> = W extends NoWait
  ? TxSendResultImmediate
  : DeployResultMined<TContract>;

/**
 * Contract interaction for deployment.
 * Handles class publication, instance publication, and initialization of the contract.
 *
 * The deployer (and therefore the deployed address) is locked once and never changes. Locking
 * happens either at construction (via `deployer` or `universalDeploy: true` in the instantiation
 * options) or lazily on the first `send` / `simulate` / `profile` call, which lock from
 * `options.from`. Once locked:
 *
 * - The address is stable for the lifetime of this object.
 * - Subsequent `send` / `simulate` / `profile` calls with a `from` that would imply a different
 *   deployer throw, to prevent silently deploying at a different address than `getAddress()`
 *   reported.
 * - A locked universal deployer (`AztecAddress.ZERO`) is compatible with any `from`, since the
 *   address does not depend on the sender.
 *
 * Note that for some contracts, a tx is not required as part of its "creation":
 * If there are no public functions, and if there are no initialization functions,
 * then technically the contract has already been "created", and all of the contract's
 * functions (private and utility) can be interacted-with immediately, without any
 * "deployment tx".
 */
export class DeployMethod<TContract extends ContractBase = ContractBase> extends BaseContractInteraction {
  /** Salt used in the address preimage. */
  protected readonly salt: Fr;
  /**
   * Deployer mixed into the address preimage. `undefined` until locked, either by `deployer` /
   * `universalDeploy: true` at construction, or by the first call to `request` / `send` /
   * `simulate` / `profile` which locks it from `options.from` (NO_FROM/undefined → ZERO,
   * AztecAddress → that address). `AztecAddress.ZERO` indicates a universal deployment. Once
   * locked, never changes; subsequent calls with an incompatible `from` throw.
   */
  protected deployer: AztecAddress | undefined;
  /** Public keys mixed into the address preimage. */
  protected readonly publicKeys: PublicKeys;

  /** Cached instance promise; resolved once after the deployer is locked. */
  private instancePromise?: Promise<ContractInstanceWithAddress>;
  /** Resolved value of `instancePromise`, populated synchronously once the promise settles. */
  private resolvedInstance?: ContractInstanceWithAddress;

  /** Constructor function to call. */
  protected constructorArtifact: FunctionAbi | undefined;

  constructor(
    wallet: Wallet,
    protected artifact: ContractArtifact,
    protected postDeployCtor: (instance: ContractInstanceWithAddress, wallet: Wallet) => TContract,
    protected args: any[] = [],
    constructorNameOrArtifact?: string | FunctionArtifact,
    instantiation: DeployInstantiationOptions = {},
    authWitnesses: AuthWitness[] = [],
    capsules: Capsule[] = [],
    protected extraHashedArgs: HashedValues[] = [],
  ) {
    super(wallet, authWitnesses, capsules);
    this.constructorArtifact = getInitializer(artifact, constructorNameOrArtifact);
    this.salt = instantiation.salt ?? Fr.random();
    this.publicKeys = instantiation.publicKeys ?? PublicKeys.default();
    if (instantiation.deployer !== undefined && instantiation.universalDeploy) {
      throw new Error('DeployInstantiationOptions: `deployer` and `universalDeploy` are mutually exclusive.');
    }
    if (instantiation.universalDeploy) {
      this.deployer = AztecAddress.ZERO;
    } else if (instantiation.deployer !== undefined) {
      this.deployer = instantiation.deployer;
    }
  }

  /**
   * Locks the deployer from a send-time `from` value. If the deployer is already locked, this
   * verifies that `from` is compatible with the locked value and throws otherwise. A locked
   * universal deployer (`AztecAddress.ZERO`) is compatible with any `from`, since "universal"
   * means the address does not depend on the sender.
   *
   * @param from - The send-time `from` value (AztecAddress, NO_FROM, or undefined).
   */
  protected lockDeployerFromSendOptions(from: SendInteractionOptionsWithoutWait['from'] | undefined): void {
    const fromAsDeployer: AztecAddress = from === undefined || from === NO_FROM ? AztecAddress.ZERO : from;
    if (this.deployer === undefined) {
      this.deployer = fromAsDeployer;
      return;
    }
    if (this.deployer.equals(AztecAddress.ZERO)) {
      return;
    }
    if (!this.deployer.equals(fromAsDeployer)) {
      throw new Error(
        `Deployer for this DeployMethod is locked to ${this.deployer.toString()}; cannot send from ${fromAsDeployer.toString()} ` +
          `because that would imply a different deployer than the one used to derive the address. ` +
          `Pass \`deployer: ${this.deployer.toString()}\` at construction if you need a different sender.`,
      );
    }
  }

  /**
   * Returns the execution payload that allows this operation to happen on chain.
   *
   * Requires the deployer to be locked already (either at construction via `deployer` /
   * `universalDeploy: true`, or as a side effect of a prior `send` / `simulate` / `profile` call,
   * which lock from `options.from`). Throws otherwise — `request` is purely about payload
   * construction and does not look at sender information.
   *
   * @param options - Configuration options.
   * @returns The execution payload for this operation
   */
  public async request(options: RequestDeployOptions = {}): Promise<ExecutionPayload> {
    if (this.deployer === undefined) {
      throw new Error(
        'Cannot build deploy execution payload: deployer is not yet locked. Pass `deployer: <address>` ' +
          'or `universalDeploy: true` as the instantiation option when constructing the deploy ' +
          '(e.g. `MyContract.deploy(wallet, ...args, { deployer: alice })`), or call `.send` / ' +
          '`.simulate` / `.profile` first to lock the deployer from the sender. When wrapping a ' +
          'DeployMethod inside a BatchCall, lock the deployer at construction since BatchCall ' +
          'invokes `request()` directly.',
      );
    }
    const publication = await this.getPublicationExecutionPayload(options);

    if (!options?.skipRegistration) {
      await this.wallet.registerContract(await this.getInstance(), this.artifact);
    }
    const { authWitnesses, capsules } = options;

    // Propagates the included authwitnesses, capsules, and extraHashedArgs
    // potentially baked into the interaction
    const initialExecutionPayload = new ExecutionPayload(
      [],
      this.authWitnesses.concat(authWitnesses ?? []),
      this.capsules.concat(capsules ?? []),
      this.extraHashedArgs,
    );
    const initialization = await this.getInitializationExecutionPayload(options);
    const feeExecutionPayload = options?.fee?.paymentMethod
      ? await options.fee.paymentMethod.getExecutionPayload()
      : undefined;
    const finalExecutionPayload = feeExecutionPayload
      ? mergeExecutionPayloads([initialExecutionPayload, feeExecutionPayload, publication, initialization])
      : mergeExecutionPayloads([initialExecutionPayload, publication, initialization]);
    if (!finalExecutionPayload.calls.length) {
      throw new Error(`No transactions are needed to publish or initialize contract ${this.artifact.name}`);
    }

    return finalExecutionPayload;
  }

  /**
   * Converts DeployOptions to SendOptions.
   * @param options - Deploy options with wait parameter.
   */
  protected convertDeployOptionsToSendOptions<W extends InteractionWaitOptions>(
    options: DeployOptions<W>,
  ): SendOptions<W> {
    return toSendOptions({ ...options, wait: options.wait as any }) as any;
  }

  /**
   * Converts deploy simulation options into wallet-level simulate options.
   * @param options - The deploy simulation options to convert.
   */
  protected convertDeployOptionsToSimulateOptions(options: SimulateDeployOptions): SimulateOptions {
    return toSimulateOptions(options);
  }

  /**
   * Converts deploy profile options into wallet-level profile options.
   * @param options - The deploy profile options to convert.
   */
  protected convertDeployOptionsToProfileOptions(
    options: DeployOptionsWithoutWait & ProfileInteractionOptions,
  ): ProfileOptions {
    return toProfileOptions(options);
  }

  /**
   * Adds this contract to the wallet and returns the Contract object.
   */
  public async register(): Promise<TContract> {
    const instance = await this.getInstance();
    await this.wallet.registerContract(instance, this.artifact);
    return this.postDeployCtor(instance, this.wallet);
  }

  /**
   * Returns an execution payload for:
   * - publication of the contract class and
   * - publication of the contract instance to enable public execution
   * depending on the provided options.
   * @param options - Contract creation options.
   * @returns An execution payload with potentially calls (and bytecode capsule) to the class registry and instance registry.
   */
  protected async getPublicationExecutionPayload(options?: RequestDeployOptions): Promise<ExecutionPayload> {
    const calls: ExecutionPayload[] = [];

    // Set contract instance object so it's available for populating the DeploySendTx object
    const instance = await this.getInstance();

    // Obtain contract class from artifact and check it matches the reported one by the instance.
    // TODO(@spalladino): We're unnecessarily calculating the contract class multiple times here.
    const contractClass = await getContractClassFromArtifact(this.artifact);
    if (!instance.currentContractClassId.equals(contractClass.id)) {
      throw new Error(
        `Contract class mismatch when deploying contract: got ${instance.currentContractClassId.toString()} from instance and ${contractClass.id.toString()} from artifact`,
      );
    }

    // Publish the contract class if it hasn't been published already.
    if (!options?.skipClassPublication) {
      const classMetadata = await this.wallet.getContractClassMetadata(contractClass.id);
      if (!classMetadata.isContractClassPubliclyRegistered) {
        this.log.info(
          `Creating request for publishing contract class ${contractClass.id.toString()} as part of deployment for ${instance.address.toString()}`,
        );
        const registerContractClassInteraction = await publishContractClass(this.wallet, this.artifact);
        calls.push(await registerContractClassInteraction.request());
      } else {
        this.log.debug(
          `Skipping contract class publication for ${contractClass.id.toString()} as it is already registered`,
        );
      }
    }

    // Publish the contract instance:
    if (!options?.skipInstancePublication) {
      // TODO(https://github.com/AztecProtocol/aztec-packages/issues/15596):
      // Read the artifact, and if there are no public functions, warn the caller that publication of the
      // contract instance is not necessary (until such time as they wish to update the instance (i.e. change its class_id)).
      const deploymentInteraction = publishInstance(this.wallet, instance);
      calls.push(await deploymentInteraction.request());
    }

    return mergeExecutionPayloads(calls);
  }

  /**
   * Returns the calls necessary to initialize the contract.
   * @param options - Deployment options.
   * @returns - An array of function calls.
   */
  protected async getInitializationExecutionPayload(options?: RequestDeployOptions): Promise<ExecutionPayload> {
    const executionsPayloads: ExecutionPayload[] = [];
    if (this.constructorArtifact && !options?.skipInitialization) {
      const { address } = await this.getInstance();
      const constructorCall = new ContractFunctionInteraction(
        this.wallet,
        address,
        this.constructorArtifact,
        this.args,
      );
      executionsPayloads.push(await constructorCall.request());
    }
    return mergeExecutionPayloads(executionsPayloads);
  }

  /**
   * Send a contract deployment transaction (initialize and/or publish) using the provided options.
   * By default, waits for the transaction to be mined and returns the deployed contract instance.
   *
   * @param options - An object containing various deployment options such as `from` and `fee`.
   * @returns TxHash (if wait is NO_WAIT), or DeployResultMined with contract, receipt, and instance (otherwise)
   */
  // Overload for when wait is not specified at all - returns the contract
  public override send(options: DeployOptionsWithoutWait): Promise<DeployResultMined<TContract>>;
  // eslint-disable-next-line jsdoc/require-jsdoc
  public override send<W extends InteractionWaitOptions>(
    options: DeployOptions<W>,
  ): Promise<DeployReturn<TContract, W>>;
  // eslint-disable-next-line jsdoc/require-jsdoc
  public override async send(options: DeployOptions<InteractionWaitOptions>): Promise<any> {
    this.lockDeployerFromSendOptions(options.from);
    const executionPayload = await this.request(options);
    const sendOptions = this.convertDeployOptionsToSendOptions(options);

    if (options.wait === NO_WAIT) {
      const result = await this.wallet.sendTx(executionPayload, sendOptions as SendOptions<NoWait>);
      this.log.debug(`Sent deployment tx ${result.txHash.hash} of ${this.artifact.name} contract`);
      return result;
    }

    const { receipt, ...offchainOutput } = await this.wallet.sendTx(
      executionPayload,
      sendOptions as SendOptions<WaitOpts | undefined>,
    );
    this.log.debug(`Deployed ${this.artifact.name} contract in tx ${receipt.txHash}`);

    // Attach contract instance
    const instance = await this.getInstance();
    const contract = this.postDeployCtor(instance, this.wallet) as TContract;

    return { contract, receipt, instance, ...offchainOutput };
  }

  /**
   * Builds the contract instance and returns it. The instance is computed once and cached for
   * the lifetime of this DeployMethod; subsequent calls return the same instance.
   *
   * Requires the deployer to have been locked. The deployer is locked either by passing
   * `deployer` / `universalDeploy: true` at construction, or by a prior call to
   * `request` / `send` / `simulate` / `profile` (which lock from `options.from`). Calling
   * `getInstance()` before the deployer is locked throws, because the address is otherwise
   * ambiguous and would silently change once the user finally invokes a send.
   *
   * @returns An instance object.
   */
  public getInstance(): Promise<ContractInstanceWithAddress> {
    if (this.deployer === undefined) {
      throw new Error(
        'Cannot resolve contract instance: deployer is not yet locked. Pass `deployer: <address>` ' +
          'or `universalDeploy: true` as the instantiation option when constructing the deploy ' +
          '(e.g. `MyContract.deploy(wallet, ...args, { deployer: alice })`), or call `.send` / ' +
          '`.simulate` / `.profile` first to lock the deployer from the sender.',
      );
    }
    const deployer = this.deployer;
    if (!this.instancePromise) {
      this.instancePromise = getContractInstanceFromInstantiationParams(this.artifact, {
        constructorArgs: this.args,
        salt: this.salt,
        publicKeys: this.publicKeys,
        constructorArtifact: this.constructorArtifact,
        deployer,
      }).then(instance => {
        this.resolvedInstance = instance;
        return instance;
      });
    }
    return this.instancePromise;
  }

  /**
   * Simulate the deployment
   *
   * @param options - An optional object containing additional configuration for the simulation.
   * @returns A simulation result object containing metadata of the execution, including gas
   * estimations (if requested via options), execution statistics and emitted offchain effects
   */
  public async simulate(options: SimulateDeployOptions): Promise<SimulationResult> {
    this.lockDeployerFromSendOptions(options.from);
    const executionPayload = await this.request(options);
    const simulatedTx = await this.wallet.simulateTx(
      executionPayload,
      this.convertDeployOptionsToSimulateOptions(options),
    );

    const { gasLimits, teardownGasLimits } = getGasLimits(simulatedTx, options.fee?.estimatedGasPadding);
    this.log.verbose(
      `Estimated gas limits for tx: DA=${gasLimits.daGas} L2=${gasLimits.l2Gas} teardownDA=${teardownGasLimits.daGas} teardownL2=${teardownGasLimits.l2Gas}`,
    );
    return {
      stats: simulatedTx.stats!,
      ...extractOffchainOutput(
        simulatedTx.offchainEffects,
        simulatedTx.publicInputs.constants.anchorBlockHeader.globalVariables.timestamp,
      ),
      result: undefined,
      estimatedGas: { gasLimits, teardownGasLimits },
    };
  }

  /**
   * Simulate a deployment and profile the gate count for each function in the transaction.
   * @param options - Same options as `send`, plus extra profiling options.
   *
   * @returns An object containing the function return value and profile result.
   */
  public async profile(options: DeployOptionsWithoutWait & ProfileInteractionOptions): Promise<TxProfileResult> {
    this.lockDeployerFromSendOptions(options.from);
    const executionPayload = await this.request(options);
    return await this.wallet.profileTx(executionPayload, this.convertDeployOptionsToProfileOptions(options));
  }

  /** Returns the deployed contract address. */
  public async getAddress(): Promise<AztecAddress> {
    return (await this.getInstance()).address;
  }

  /** Returns the partial address for this deployment. */
  public async getPartialAddress(): Promise<Fr> {
    return computePartialAddress(await this.getInstance());
  }

  /**
   * Returns the cached resolved instance synchronously, or throws if no instance has been computed yet.
   * Intended for subclasses that run inside a code path where `getInstance()` is guaranteed to have already
   * been awaited (e.g. `request()` invoked it). Not part of the public API.
   */
  protected getCachedInstanceOrThrow(): ContractInstanceWithAddress {
    if (!this.resolvedInstance) {
      throw new Error('Contract instance has not been computed yet. Call getInstance() first.');
    }
    return this.resolvedInstance;
  }

  /**
   * Augments this DeployMethod with additional metadata, such as authWitnesses and capsules.
   * @param options - An object containing the metadata to add to the interaction
   * @returns A new DeployMethod with the added metadata, but calling the same original function in the same manner
   */
  public with({
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
  }): DeployMethod {
    return new DeployMethod(
      this.wallet,
      this.artifact,
      this.postDeployCtor,
      this.args,
      this.constructorArtifact?.name,
      this.cloneInstantiation(),
      this.authWitnesses.concat(authWitnesses),
      this.capsules.concat(capsules),
      this.extraHashedArgs.concat(extraHashedArgs),
    );
  }

  /**
   * Returns the instantiation options to pass to a freshly-constructed copy of this DeployMethod
   * (e.g. via `with(...)`). Encodes the current locked-deployer state: a locked AztecAddress.ZERO
   * deployer becomes `universalDeploy: true`; an undefined deployer stays unset so the new copy can
   * still infer it from the first send.
   */
  protected cloneInstantiation(): DeployInstantiationOptions {
    if (this.deployer === undefined) {
      return { salt: this.salt, publicKeys: this.publicKeys };
    }
    if (this.deployer.equals(AztecAddress.ZERO)) {
      return { salt: this.salt, publicKeys: this.publicKeys, universalDeploy: true };
    }
    return { salt: this.salt, publicKeys: this.publicKeys, deployer: this.deployer };
  }
}
