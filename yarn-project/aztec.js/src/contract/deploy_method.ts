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
import {
  type InteractionFeeOptions,
  type InteractionWaitOptions,
  NO_FROM,
  NO_WAIT,
  type NoWait,
  type OffchainOutput,
  type ProfileInteractionOptions,
  type RequestInteractionOptions,
  type SendInteractionOptionsWithoutWait,
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
  /**
   * Commitment to the contract's immutable storage values. Folded into the salted initialization
   * hash, so a non-zero value affects the derived address. Defaults to `Fr.ZERO`.
   */
  immutablesHash?: Fr;
};

/**
 * Address-derivation inputs shared by all deploy methods. {@link BoundInstantiationOptions},
 * {@link UniversalInstantiationOptions}, and {@link PendingInstantiationOptions} narrow this
 * shape to forbid the fields that don't apply to a given flavor at the type level.
 */
type SharedInstantiationOptions = {
  /** Salt used to derive the contract address. Defaults to a random Fr. */
  salt?: Fr;
  /** Public keys mixed into the address. Defaults to `PublicKeys.default()`. */
  publicKeys?: PublicKeys;
  /**
   * Commitment to the contract's immutable storage values. Folded into the salted initialization
   * hash, so a non-zero value affects the derived address. Defaults to `Fr.ZERO`.
   */
  immutablesHash?: Fr;
};

/**
 * Narrowed `DeployInstantiationOptions` accepted by {@link BoundDeployMethod}: requires a
 * concrete `deployer` and forbids `universalDeploy`. The runtime check that `deployer` is
 * non-zero stays as defense in depth (it's a value-level invariant the type system can't model).
 */
export type BoundInstantiationOptions = SharedInstantiationOptions & {
  /** Concrete deployer mixed into the address preimage. Required, must be non-zero. */
  deployer: AztecAddress;
  /** Forbidden on `BoundDeployMethod`; use `UniversalDeployMethod` for universal deploys. */
  universalDeploy?: never;
};

/**
 * Narrowed `DeployInstantiationOptions` accepted by {@link UniversalDeployMethod}: forbids
 * `deployer` and requires `universalDeploy: true` (so the call site reads as a universal deploy).
 */
export type UniversalInstantiationOptions = SharedInstantiationOptions & {
  /** Forbidden on `UniversalDeployMethod`; use `BoundDeployMethod` if you need a concrete deployer. */
  deployer?: never;
  /** Marks this as a universal deploy. Required for clarity at the call site. */
  universalDeploy: true;
};

/**
 * Narrowed `DeployInstantiationOptions` accepted by {@link PendingDeployMethod}: forbids both
 * `deployer` and `universalDeploy`. The deploy is locked from the first send-time `from` instead.
 */
export type PendingInstantiationOptions = SharedInstantiationOptions & {
  /** Forbidden on `PendingDeployMethod`; use `BoundDeployMethod` for a concrete deployer. */
  deployer?: never;
  /** Forbidden on `PendingDeployMethod`; use `UniversalDeployMethod` for a universal deploy. */
  universalDeploy?: never;
};

/**
 * Identifies *which contract* is being deployed and *with what initializer*.
 */
export type DeployMethodContract<TContract extends ContractBase = ContractBase> = {
  /** Build artifact of the contract being deployed. */
  artifact: ContractArtifact;
  /** Factory invoked after deployment to produce the typed contract handle. */
  postDeployCtor: (instance: ContractInstanceWithAddress, wallet: Wallet) => TContract;
  /** Encoded constructor arguments for the contract. Defaults to `[]`. */
  args?: any[];
  /** Name (or full artifact) of the initializer to call. */
  constructorNameOrArtifact?: string | FunctionArtifact;
};

/**
 * Execution-payload metadata propagated through `request` / `send` / `simulate` / `profile`.
 */
export type DeployMethodPayload = {
  /** Auth witnesses propagated to the deploy interaction. */
  authWitnesses?: AuthWitness[];
  /** Capsules propagated to the deploy interaction. */
  capsules?: Capsule[];
  /** Extra hashed args propagated to the deploy interaction. */
  extraHashedArgs?: HashedValues[];
};

/**
 * Options for deploying a contract on the Aztec network.
 * Controls publication and registration policy for this deployment.
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
  fee?: InteractionFeeOptions;
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
 * Umbrella type for a contract deployment interaction.
 *
 * `DeployMethod` is abstract: callers always interact with one of three concrete flavors —
 * {@link BoundDeployMethod}, {@link UniversalDeployMethod}, or {@link PendingDeployMethod} —
 * picked by {@link DeployMethod.create} based on the supplied {@link DeployInstantiationOptions}.
 * The flavors only differ in their initial deployer-lock state; the full API
 * (`request` / `send` / `simulate` / `profile` / `getInstance` / `getAddress` /
 * `getPartialAddress` / `register` / `with`) lives on this base, so consumers can type
 * variables as `DeployMethod<T>` and treat all three uniformly.
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
export abstract class DeployMethod<TContract extends ContractBase = ContractBase> extends BaseContractInteraction {
  /** Salt used in the address preimage. */
  protected readonly salt: Fr;
  /** Public keys mixed into the address preimage. */
  protected readonly publicKeys: PublicKeys;
  /** Immutables hash folded into the salted initialization hash. */
  protected readonly immutablesHash: Fr;

  /** Cached instance promise; resolved once the deployer is known. */
  #instancePromise?: Promise<ContractInstanceWithAddress>;
  /** Resolved value of `#instancePromise`, populated synchronously once the promise settles. */
  #resolvedInstance?: ContractInstanceWithAddress;

  /** Constructor function to call. */
  protected constructorArtifact: FunctionAbi | undefined;
  /** Build artifact of the contract being deployed. */
  protected readonly artifact: ContractArtifact;
  /** Factory invoked after deployment to produce the typed contract handle. */
  protected readonly postDeployCtor: (instance: ContractInstanceWithAddress, wallet: Wallet) => TContract;
  /** Encoded constructor arguments for the contract. */
  protected readonly args: any[];
  /** Extra hashed args propagated through `with(...)` and into the deploy payload. */
  protected readonly extraHashedArgs: HashedValues[];

  protected constructor(
    wallet: Wallet,
    contract: DeployMethodContract<TContract>,
    salt: Fr | undefined,
    publicKeys: PublicKeys | undefined,
    immutablesHash: Fr | undefined,
    payload: DeployMethodPayload = {},
  ) {
    super(wallet, payload.authWitnesses ?? [], payload.capsules ?? []);
    this.artifact = contract.artifact;
    this.postDeployCtor = contract.postDeployCtor;
    this.args = contract.args ?? [];
    this.constructorArtifact = getInitializer(contract.artifact, contract.constructorNameOrArtifact);
    this.salt = salt ?? Fr.random();
    this.publicKeys = publicKeys ?? PublicKeys.default();
    this.immutablesHash = immutablesHash ?? Fr.ZERO;
    this.extraHashedArgs = payload.extraHashedArgs ?? [];
  }

  /**
   * The address that will be mixed into the contract's address preimage. Owned returns the
   * concrete deployer; Universal returns `AztecAddress.ZERO`; Pending throws unless a prior
   * `send` / `simulate` / `profile` call has already locked it.
   */
  public abstract getDeployerAddress(): AztecAddress;

  /**
   * Reconciles a send-time `from` with the deploy's deployer. Owned asserts an exact match;
   * Universal accepts anything; Pending uses the first call to lock its deployer (transitioning
   * into an Owned/Universal sibling), then defers to that sibling's assertion on subsequent calls.
   *
   * The "locks-or-asserts" name is intentional: only Pending mutates state, and only on its first
   * invocation. Owned and Universal are pure assertions.
   *
   * @param from - The send-time `from` value (`AztecAddress`, `NO_FROM`, or `undefined`).
   */
  public abstract lockDeployer(from: SendInteractionOptionsWithoutWait['from'] | undefined): void;

  /**
   * Returns the {@link DeployInstantiationOptions} that match this flavor. Used by `with(...)` to
   * spawn a sibling instance carrying the same lock state.
   */
  public abstract cloneInstantiation(): DeployInstantiationOptions;

  /**
   * Constructs the right concrete `DeployMethod` flavor for the supplied instantiation options:
   * - `{ deployer: <addr> }` → {@link BoundDeployMethod}
   * - `{ universalDeploy: true }` → {@link UniversalDeployMethod}
   * - neither set → {@link PendingDeployMethod}
   *
   * Mixing `deployer` and `universalDeploy` throws. Returns the umbrella `DeployMethod<T>` type so
   * callers can use the result generically without narrowing.
   *
   * @param wallet - Wallet used to send / simulate the deploy tx.
   * @param contract - The contract being deployed (artifact, factory, args, initializer).
   * @param instantiation - Address-affecting parameters (salt, deployer / universalDeploy, publicKeys). Defaults to pending.
   * @param payload - Auth witnesses, capsules, and extra hashed args propagated to the deploy. Defaults to empty.
   */
  public static create<TContract extends ContractBase>(
    wallet: Wallet,
    contract: DeployMethodContract<TContract>,
    instantiation: DeployInstantiationOptions = {},
    payload: DeployMethodPayload = {},
  ): DeployMethod<TContract> {
    if (instantiation.deployer !== undefined && instantiation.universalDeploy) {
      throw new Error('DeployInstantiationOptions: `deployer` and `universalDeploy` are mutually exclusive.');
    }
    const { salt, publicKeys, immutablesHash, deployer, universalDeploy } = instantiation;
    if (universalDeploy) {
      return new UniversalDeployMethod<TContract>(
        wallet,
        contract,
        { salt, publicKeys, immutablesHash, universalDeploy: true },
        payload,
      );
    }
    if (deployer !== undefined) {
      return new BoundDeployMethod<TContract>(
        wallet,
        contract,
        { salt, publicKeys, immutablesHash, deployer },
        payload,
      );
    }
    return new PendingDeployMethod<TContract>(wallet, contract, { salt, publicKeys, immutablesHash }, payload);
  }

  /**
   * Returns the execution payload that allows this operation to happen on chain. Requires the
   * deployer to be known — call `getDeployerAddress()` first; on a `PendingDeployMethod` this
   * throws unless a prior `send` / `simulate` / `profile` has already locked the deployer.
   *
   * @param options - Configuration options.
   * @returns The execution payload for this operation
   */
  public async request(options: RequestDeployOptions = {}): Promise<ExecutionPayload> {
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
    this.lockDeployer(options.from);
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
   * On a {@link PendingDeployMethod} this throws unless a prior `send` / `simulate` / `profile`
   * call has already locked the deployer — otherwise the resolved address could silently differ
   * from the eventually-deployed one.
   *
   * @returns An instance object.
   */
  public getInstance(): Promise<ContractInstanceWithAddress> {
    const deployer = this.getDeployerAddress();
    if (!this.#instancePromise) {
      this.#instancePromise = getContractInstanceFromInstantiationParams(this.artifact, {
        constructorArgs: this.args,
        salt: this.salt,
        publicKeys: this.publicKeys,
        immutablesHash: this.immutablesHash,
        constructorArtifact: this.constructorArtifact,
        deployer,
      }).then(instance => {
        this.#resolvedInstance = instance;
        return instance;
      });
    }
    return this.#instancePromise;
  }

  /**
   * Simulate the deployment
   *
   * @param options - An optional object containing additional configuration for the simulation.
   * @returns A simulation result object containing metadata of the execution, including gas
   * estimations (if requested via options), execution statistics and emitted offchain effects
   */
  public async simulate(options: SimulateDeployOptions): Promise<SimulationResult> {
    this.lockDeployer(options.from);
    const executionPayload = await this.request(options);
    const simulatedTx = await this.wallet.simulateTx(
      executionPayload,
      this.convertDeployOptionsToSimulateOptions(options),
    );

    return {
      stats: simulatedTx.stats!,
      ...extractOffchainOutput(
        simulatedTx.offchainEffects,
        simulatedTx.publicInputs.constants.anchorBlockHeader.globalVariables.timestamp,
      ),
      result: undefined,
      gasUsed: simulatedTx.gasUsed,
    };
  }

  /**
   * Simulate a deployment and profile the gate count for each function in the transaction.
   * @param options - Same options as `send`, plus extra profiling options.
   *
   * @returns An object containing the function return value and profile result.
   */
  public async profile(options: DeployOptionsWithoutWait & ProfileInteractionOptions): Promise<TxProfileResult> {
    this.lockDeployer(options.from);
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
    if (!this.#resolvedInstance) {
      throw new Error('Contract instance has not been computed yet. Call getInstance() first.');
    }
    return this.#resolvedInstance;
  }

  /**
   * Augments this DeployMethod with additional metadata, such as authWitnesses and capsules. The
   * deployer lock is preserved: a Pending that has not yet been locked stays Pending; a Pending
   * that has already locked, along with Owned and Universal, returns the matching locked flavor
   * so the cloned method deploys at the same address as `this`.
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
  }): DeployMethod<TContract> {
    return DeployMethod.create(
      this.wallet,
      {
        artifact: this.artifact,
        postDeployCtor: this.postDeployCtor,
        args: this.args,
        constructorNameOrArtifact: this.constructorArtifact?.name,
      },
      this.cloneInstantiation(),
      {
        authWitnesses: this.authWitnesses.concat(authWitnesses),
        capsules: this.capsules.concat(capsules),
        extraHashedArgs: this.extraHashedArgs.concat(extraHashedArgs),
      },
    );
  }
}

/**
 * Deploy method whose deployer is fixed at construction to a concrete {@link AztecAddress}. The
 * deployer is mixed into the address preimage, so the contract address is fully determined.
 *
 * Sending from a different account throws — letting it through would silently produce a deployed
 * address different from the one `getAddress()` reported.
 */
export class BoundDeployMethod<TContract extends ContractBase = ContractBase> extends DeployMethod<TContract> {
  /** The address baked into the address preimage. Read-only — set at construction. */
  public readonly deployer: AztecAddress;

  public constructor(
    wallet: Wallet,
    contract: DeployMethodContract<TContract>,
    instantiation: BoundInstantiationOptions,
    payload: DeployMethodPayload = {},
  ) {
    // `BoundInstantiationOptions` requires a `deployer` and forbids `universalDeploy` at the type
    // level. We still reject `AztecAddress.ZERO` here because the type system can't model it.
    if (instantiation.deployer.equals(AztecAddress.ZERO)) {
      throw new Error(
        'BoundDeployMethod requires a non-zero `deployer`; use `UniversalDeployMethod` (`{ universalDeploy: true }`) for universal deploys.',
      );
    }
    super(wallet, contract, instantiation.salt, instantiation.publicKeys, instantiation.immutablesHash, payload);
    this.deployer = instantiation.deployer;
  }

  /** Returns the locked deployer baked into the address preimage. */
  public getDeployerAddress(): AztecAddress {
    return this.deployer;
  }

  /**
   * Throws unless `from` matches the locked deployer; the deployer is part of the address.
   * @param from - The send-time `from` value (`AztecAddress`, `NO_FROM`, or `undefined`).
   */
  public lockDeployer(from: SendInteractionOptionsWithoutWait['from'] | undefined): void {
    if (from === undefined || from === NO_FROM || !this.deployer.equals(from)) {
      const sender = from === undefined ? '<unspecified>' : from === NO_FROM ? 'NO_FROM' : from.toString();
      throw new Error(
        `Deployer for this DeployMethod is locked to ${this.deployer.toString()}; cannot send from ${sender} ` +
          `because that would imply a different deployer than the one used to derive the address. ` +
          `Pass \`from: ${this.deployer.toString()}\` to send from the locked deployer, or reconstruct the ` +
          `deploy with a different \`deployer\` if you need a different sender.`,
      );
    }
  }

  /** Re-emits this method's `DeployInstantiationOptions` for `with(...)` to consume. */
  public cloneInstantiation(): DeployInstantiationOptions {
    return {
      salt: this.salt,
      publicKeys: this.publicKeys,
      immutablesHash: this.immutablesHash,
      deployer: this.deployer,
    };
  }
}

/**
 * Deploy method whose deployer is fixed at construction to {@link AztecAddress.ZERO} (universal
 * deploy). The address does not depend on the sender, so any account may sign the deploy tx.
 */
export class UniversalDeployMethod<TContract extends ContractBase = ContractBase> extends DeployMethod<TContract> {
  public constructor(
    wallet: Wallet,
    contract: DeployMethodContract<TContract>,
    instantiation: UniversalInstantiationOptions,
    payload: DeployMethodPayload = {},
  ) {
    // `UniversalInstantiationOptions` forbids `deployer` and requires `universalDeploy: true` at
    // the type level — no runtime check is needed.
    super(wallet, contract, instantiation.salt, instantiation.publicKeys, instantiation.immutablesHash, payload);
  }

  /** Universal deploys are anchored at `AztecAddress.ZERO`; the sender does not enter the preimage. */
  public getDeployerAddress(): AztecAddress {
    return AztecAddress.ZERO;
  }

  /**
   * Universal deploys accept any sender, including `NO_FROM` / `undefined`.
   * @param _from - Ignored.
   */
  public lockDeployer(_from: SendInteractionOptionsWithoutWait['from'] | undefined): void {
    // No-op.
  }

  /** Re-emits this method's `DeployInstantiationOptions` for `with(...)` to consume. */
  public cloneInstantiation(): DeployInstantiationOptions {
    return {
      salt: this.salt,
      publicKeys: this.publicKeys,
      immutablesHash: this.immutablesHash,
      universalDeploy: true,
    };
  }
}

/**
 * Deploy method whose deployer is not yet decided. The first `send` / `simulate` / `profile` call
 * promotes this into an {@link BoundDeployMethod} or {@link UniversalDeployMethod} (depending on
 * whether `options.from` is an address or `NO_FROM` / `undefined`); subsequent calls reuse that
 * promotion and reject mismatching `from` values.
 *
 * Reading the address (`getInstance` / `getAddress` / `getPartialAddress`) or building a payload
 * (`request`) before the promotion happens throws — the address would otherwise be ambiguous and
 * could differ from what `send()` ends up deploying.
 */
export class PendingDeployMethod<TContract extends ContractBase = ContractBase> extends DeployMethod<TContract> {
  /**
   * The locked sibling created on the first send-side call. Once set, all flavor-specific
   * decisions (sender compatibility, address derivation, clone shape) delegate to it, so a second
   * call with a mismatched `from` is rejected by `BoundDeployMethod.lockDeployer`.
   */
  #locked?: BoundDeployMethod<TContract> | UniversalDeployMethod<TContract>;

  public constructor(
    wallet: Wallet,
    contract: DeployMethodContract<TContract>,
    instantiation: PendingInstantiationOptions = {},
    payload: DeployMethodPayload = {},
  ) {
    super(wallet, contract, instantiation.salt, instantiation.publicKeys, instantiation.immutablesHash, payload);
  }

  /**
   * Returns the locked deployer once it has happened. Throws while still pending — the
   * address would otherwise differ from what `send()` ends up deploying.
   */
  public getDeployerAddress(): AztecAddress {
    if (!this.#locked) {
      throw new Error(
        'Cannot resolve contract address: deployer is not yet locked. Pass `deployer: <address>` ' +
          'or `universalDeploy: true` as the instantiation option when constructing the deploy ' +
          '(e.g. `MyContract.deploy(wallet, ...args, { deployer: alice })`), or call `.send` / ' +
          '`.simulate` / `.profile` first to lock the deployer from the sender. ',
      );
    }
    return this.#locked.getDeployerAddress();
  }

  /**
   * On the first call, promotes this pending method into a locked sibling and remembers it. On
   * subsequent calls, defers to the locked sibling — so a mismatched `from` is rejected by the
   * sibling's own policy, not a duplicate one here.
   * @param from - The send-time `from` value (`AztecAddress`, `NO_FROM`, or `undefined`).
   */
  public lockDeployer(from: SendInteractionOptionsWithoutWait['from'] | undefined): void {
    if (!this.#locked) {
      this.#locked = this.#promoteFrom(from);
      return;
    }
    this.#locked.lockDeployer(from);
  }

  /** Re-emits this method's `DeployInstantiationOptions` for `with(...)` to consume. */
  public cloneInstantiation(): DeployInstantiationOptions {
    if (!this.#locked) {
      return { salt: this.salt, publicKeys: this.publicKeys, immutablesHash: this.immutablesHash };
    }
    return this.#locked.cloneInstantiation();
  }

  /**
   * Builds the locked sibling implied by a send-time `from`: an `AztecAddress` becomes
   * {@link BoundDeployMethod}; `NO_FROM` / `undefined` becomes {@link UniversalDeployMethod}.
   * @param from - The send-time `from` value.
   */
  #promoteFrom(
    from: SendInteractionOptionsWithoutWait['from'] | undefined,
  ): BoundDeployMethod<TContract> | UniversalDeployMethod<TContract> {
    const {
      wallet,
      artifact,
      postDeployCtor,
      args,
      salt,
      publicKeys,
      immutablesHash,
      authWitnesses,
      capsules,
      extraHashedArgs,
    } = this;
    const contract: DeployMethodContract<TContract> = {
      artifact,
      postDeployCtor,
      args,
      constructorNameOrArtifact: this.constructorArtifact?.name,
    };
    const payload: DeployMethodPayload = { authWitnesses, capsules, extraHashedArgs };
    if (from === undefined || from === NO_FROM) {
      return new UniversalDeployMethod<TContract>(
        wallet,
        contract,
        { salt, publicKeys, immutablesHash, universalDeploy: true },
        payload,
      );
    }
    return new BoundDeployMethod<TContract>(
      wallet,
      contract,
      { salt, publicKeys, immutablesHash, deployer: from },
      payload,
    );
  }
}
