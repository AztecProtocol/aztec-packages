import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { KeyStore } from '@aztec/key-store';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openEphemeralStore } from '@aztec/kv-store/lmdb-v2';
import {
  AddressStore,
  AnchorBlockStore,
  AnchoredContractData,
  CapsuleService,
  CapsuleStore,
  ContractStore,
  FactService,
  FactStore,
  JobCoordinator,
  NoteService,
  NoteStore,
  PrivateEventStore,
  RecipientTaggingStore,
  SenderTaggingStore,
  TaggingSecretSourcesStore,
  composeHooks,
} from '@aztec/pxe/server';
import {
  ExecutionNoteCache,
  ExecutionTaggingIndexCache,
  HashedValuesCache,
  type IMiscOracle,
  type IPrivateExecutionOracle,
  type IUtilityExecutionOracle,
  LEGACY_ORACLE_REGISTRY,
  Option,
  TransientArrayService,
  UtilityExecutionOracle,
  buildACIRCallback,
} from '@aztec/pxe/simulator';
import {
  ExecutionError,
  WASMSimulator,
  createSimulationError,
  extractCallStack,
  resolveAssertionMessageFromError,
  toACVMWitness,
} from '@aztec/simulator/client';
import { STANDARD_AUTH_REGISTRY_ADDRESS } from '@aztec/standard-contracts/auth-registry/constants';
import { EventSelector, FunctionCall, FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';
import { computeProtocolNullifier } from '@aztec/stdlib/hash';
import { PrivateContextInputs } from '@aztec/stdlib/kernel';
import { makeGlobalVariables } from '@aztec/stdlib/testing';
import { CallContext, GlobalVariables, OFFCHAIN_MESSAGE_IDENTIFIER, TxContext } from '@aztec/stdlib/tx';

import { z } from 'zod';

import { DEFAULT_ADDRESS, MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY, MAX_OFFCHAIN_EFFECT_LEN } from './constants.js';
import type { IAvmExecutionOracle, ITxeExecutionOracle } from './oracle/interfaces.js';
import {
  type TXETaggingSecretStrategies,
  makeResolveTaggingSecretStrategyHook,
} from './oracle/tagging_secret_strategy.js';
import { TXEOraclePublicContext } from './oracle/txe_oracle_public_context.js';
import { callTxeLegacyHandler } from './oracle/txe_oracle_registry.js';
import { TXEOracleTopLevelContext, authorizeAllUtilityCallsHook } from './oracle/txe_oracle_top_level_context.js';
import { TXE_ORACLE_VERSION_MAJOR, TXE_ORACLE_VERSION_MINOR } from './oracle/txe_oracle_version.js';
import { TXEPrivateExecutionOracle } from './oracle/txe_private_execution_oracle.js';
import { RPCTranslator, UnavailableOracleError } from './rpc_translator.js';
import { TXEArchiver } from './state_machine/archiver.js';
import { TXEStateMachine } from './state_machine/index.js';
import { getSingleTxBlockRequestHash, insertTxEffectIntoWorldTrees, makeTXEBlock } from './utils/block_creation.js';
import type { ForeignCallArgs, ForeignCallResult } from './utils/encoding.js';
import { makeTxEffect } from './utils/tx_effect_creation.js';
import { TXEAccountStore } from './utils/txe_account_store.js';
import type { TXEArtifactResolver } from './utils/txe_artifact_resolver.js';

/**
 * A TXE Session can be in one of four states, which change as the test progresses and different oracles are called.
 * The current state determines which oracles are available. Some states also have data associated with them.
 */
type SessionState =
  /**
   * The top-level state is the default state, before any other state has been entered. This is where contracts can be
   * deployed, accounts created, blocks mined, etc.
   */
  | {
      name: 'TOP_LEVEL';
    }
  /**
   * The private state is entered via the `private_context` function. In this state the PXE oracles that `#[external("private")]`
   * functions use are available, such as those related to note retrieval, notification of side-effects, capsule access,
   * etc. */
  | {
      name: 'PRIVATE';
      nextBlockGlobalVariables: GlobalVariables;
      noteCache: ExecutionNoteCache;
      taggingIndexCache: ExecutionTaggingIndexCache;
    }
  /**
   * The public state is entered via the `public_context` function. In this state the AVM opcodes that `#[external("public")]`
   * functions execute are resolved as oracles by TXE, since Noir tests are not transpiled. */
  | {
      name: 'PUBLIC';
    }
  /**
   * The utility state is entered via the `utility_context` function. In this state the PXE oracles that `#[external("utility")]`
   * functions use are available, such as those related to (unconstrained) note retrieval, capsule access, public
   * storage reads, etc.
   */
  | {
      name: 'UTILITY';
    };

type MethodNames<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

/**
 * The name of an oracle function that TXE supports, which are a combination of PXE oracles, non-transpiled AVM opcodes,
 * and custom TXE oracles.
 */
export type TXEOracleFunctionName = Exclude<
  MethodNames<RPCTranslator>,
  'constructor' | 'handlerAsMisc' | 'handlerAsUtility' | 'handlerAsPrivate' | 'handlerAsAvm' | 'handlerAsTxe'
>;

export interface TXESessionStateHandler {
  /** Records the TXE oracle version reported by the Noir test code for diagnostics. */
  setTxeOracleVersion(major: number, minor: number): void;

  enterTopLevelState(): Promise<void>;
  enterPublicState(contractAddress: Option<AztecAddress>): Promise<void>;
  enterPrivateState(
    contractAddress: Option<AztecAddress>,
    anchorBlockNumber: Option<BlockNumber>,
    gasSettings: GasSettings,
  ): Promise<PrivateContextInputs>;
  enterUtilityState(contractAddress: Option<AztecAddress>): Promise<void>;

  /**
   * Executes a top-level private call: runs the private function, drains its offchain effects into the session buffer,
   * commits the job, and (for non-static calls) tags the result with the mined tx hash.
   */
  executePrivateCall(
    from: Option<AztecAddress>,
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    args: Fr[],
    argsHash: Fr,
    isStaticCall: boolean,
    additionalScopes: AztecAddress[],
    authorizedUtilityCallTargets: AztecAddress[],
    gasSettings: GasSettings,
  ): Promise<Fr[]>;

  /** Executes a top-level utility function and commits the job. */
  executeUtilityFunction(
    from: Option<AztecAddress>,
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    args: Fr[],
    authorizedUtilityCallTargets: AztecAddress[],
  ): Promise<Fr[]>;

  /**
   * Executes a top-level public call, commits the job, and (for non-static calls) tags the result with the mined tx
   * hash.
   */
  executePublicCall(
    from: Option<AztecAddress>,
    targetContractAddress: AztecAddress,
    calldata: Fr[],
    isStaticCall: boolean,
    gasSettings: GasSettings,
  ): Promise<Fr[]>;

  /** Syncs the target contract and returns the private events it emitted matching the given selector and scope. */
  getPrivateEvents(selector: EventSelector, contractAddress: AztecAddress, scope: AztecAddress): Promise<Fr[][]>;

  /**
   * Captures a raw offchain effect payload for consumption from test environment. Called by the `emit_offchain_effect`
   * oracle handler whenever a contract function emits an offchain message, at any call depth.
   */
  recordOffchainEffect(data: Fr[]): void;

  /**
   * Returns the raw offchain effect payloads emitted by the last top-level call. Each payload follows the protocol
   * convention documented on `OFFCHAIN_MESSAGE_IDENTIFIER`, i.e. `[identifier, recipient, ...ciphertext]`. Decoding into
   * `OffchainMessage` structs happens on the Noir side of the test helper. Marks the buffer as queried so the
   * unqueried-messages warning doesn't fire on the next reset.
   */
  getLastCallOffchainEffects(): { effects: Fr[][] };

  /**
   * Returns the context of the last top-level call: its tx hash (`Fr.ZERO` if the call was tx-less) and the anchor
   * block timestamp captured at the start of the call. Does *not* mark the buffer as queried — context reads are
   * metadata, not effect consumption.
   */
  getLastCallContext(): { txHash: Fr; anchorBlockTimestamp: bigint };
}

/**
 * Session state tracking the most recently completed top-level call: the offchain effect buffer it produced, and the
 * call's context (tx hash + anchor block timestamp). The context is refreshed on every top-level call, independently
 * of whether the call produced offchain effects.
 */
interface LastCallState {
  /**
   * Raw offchain effect payloads emitted by the currently-executing (or most recently completed) top-level call. Wiped
   * at the start of every top-level entry point, appended to on every `emit_offchain_effect` oracle invocation.
   */
  offchainEffects: Fr[][];
  /**
   * Tracks whether the test has queried `effects` since the last reset. If a new top-level call clobbers the buffer
   * without it being queried first, any accumulated messages are lost and we emit a warning so tests don't silently
   * drop delivery.
   */
  queried: boolean;
  /**
   * Tx hash of the most recently completed top-level call, or `Fr.ZERO` if the call was tx-less (context setters,
   * utility execution). Populated by call executor handlers after execution completes.
   */
  txHash: Fr;
  /**
   * Anchor block timestamp of the most recently completed top-level call, captured from the anchor block header that
   * was active when the call started. Populated by call executor handlers after execution completes.
   */
  anchorBlockTimestamp: bigint;
}

function emptyLastCallState(): LastCallState {
  return { offchainEffects: [], queried: false, txHash: Fr.ZERO, anchorBlockTimestamp: 0n };
}

/**
 * A `TXESession` corresponds to a Noir `#[test]` function, and handles all of its oracle calls, stores test-specific
 * state, etc., independent of all other tests running in parallel.
 */
export class TXESession implements TXESessionStateHandler {
  private state: SessionState = { name: 'TOP_LEVEL' };
  private authwits: Map<string, AuthWitness> = new Map();
  private taggingSecretStrategies: TXETaggingSecretStrategies = new Map();
  private authorizeAllUtilityCallTargets = false;
  private lastCallInfo: LastCallState = emptyLastCallState();
  private txeOracleVersion: { major: number; minor: number } | undefined;

  private disposed = false;

  constructor(
    private logger: Logger,
    private sessionStore: AztecAsyncKVStore,
    private stateMachine: TXEStateMachine,
    private oracleHandler:
      | IMiscOracle
      | IUtilityExecutionOracle
      | IPrivateExecutionOracle
      | IAvmExecutionOracle
      | ITxeExecutionOracle,
    private contractStore: ContractStore,
    private noteStore: NoteStore,
    private keyStore: KeyStore,
    private addressStore: AddressStore,
    private accountStore: TXEAccountStore,
    private senderTaggingStore: SenderTaggingStore,
    private recipientTaggingStore: RecipientTaggingStore,
    private taggingSecretSourcesStore: TaggingSecretSourcesStore,
    private capsuleStore: CapsuleStore,
    private factStore: FactStore,
    private privateEventStore: PrivateEventStore,
    private jobCoordinator: JobCoordinator,
    private currentJobId: string,
    private chainId: Fr,
    private version: Fr,
    private nextBlockTimestamp: bigint,
    private readonly artifactResolver: TXEArtifactResolver,
    private readonly rootPath: string,
    private readonly packageName: string,
  ) {}

  /**
   * Tears down the per-session AVM simulator (process pool + CDB server), the `NativeWorldStateService`,
   * and the `txe-session` LMDB. Called via IPC when the dispatcher detects the end of a test. Idempotent.
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    // Dispose the AVM pool before the world state: it kills the bb-avm-sim processes so they release their
    // connection to the WSDB server, letting it shut down cleanly. Skipping this leaks a bb-avm-sim process
    // (and keeps its WSDB alive) per session.
    try {
      await this.stateMachine.synchronizer.closeIpc();
    } catch (err) {
      this.logger.warn(`Error closing AVM simulator during session dispose`, err);
    }
    try {
      await this.stateMachine.synchronizer.nativeWorldStateService.close();
    } catch (err) {
      this.logger.warn(`Error closing native world state during session dispose`, err);
    }
    try {
      await this.sessionStore.close();
    } catch (err) {
      this.logger.warn(`Error closing session LMDB during dispose`, err);
    }
  }

  static async init(
    contractStore: ContractStore,
    artifactResolver: TXEArtifactResolver,
    rootPath: string,
    packageName: string,
  ) {
    // Size LMDB's reader slots to the libuv pool (capped to 2 in bin/index.ts via
    // HARDWARE_CONCURRENCY): each native LMDB read needs a libuv worker thread to run, so any
    // slot beyond the pool size would sit idle while still consuming a semaphore + reader-table
    // entry per session.
    const store = await openEphemeralStore('txe-session', undefined, 2);

    const addressStore = new AddressStore(store);
    const privateEventStore = new PrivateEventStore(store);
    const noteStore = new NoteStore(store);
    const senderTaggingStore = new SenderTaggingStore(store);
    const recipientTaggingStore = new RecipientTaggingStore(store);
    const taggingSecretSourcesStore = new TaggingSecretSourcesStore(store);
    const capsuleStore = new CapsuleStore(store);
    const factStore = new FactStore(store);
    const keyStore = new KeyStore(store);
    const accountStore = new TXEAccountStore(store);

    const jobCoordinator = new JobCoordinator(store);
    jobCoordinator.registerStores([
      capsuleStore,
      factStore,
      senderTaggingStore,
      recipientTaggingStore,
      privateEventStore,
      noteStore,
    ]);

    const archiver = new TXEArchiver(store);
    const anchorBlockStore = new AnchorBlockStore(store);
    const stateMachine = await TXEStateMachine.create(archiver, anchorBlockStore, contractStore, noteStore);

    const nextBlockTimestamp = BigInt(Math.floor(new Date().getTime() / 1000));
    const version = new Fr(await stateMachine.node.getVersion());
    const chainId = new Fr(await stateMachine.node.getChainId());

    const initialJobId = jobCoordinator.beginJob();

    const logger = createLogger('txe:session');

    const topLevelOracleHandler = new TXEOracleTopLevelContext(
      stateMachine,
      contractStore,
      noteStore,
      keyStore,
      addressStore,
      accountStore,
      senderTaggingStore,
      recipientTaggingStore,
      taggingSecretSourcesStore,
      capsuleStore,
      factStore,
      privateEventStore,
      nextBlockTimestamp,
      version,
      chainId,
      new Map(),
      new Map(),
      false, // authorizeAllUtilityCallTargets
      artifactResolver,
      rootPath,
      packageName,
    );

    await topLevelOracleHandler.mineDeploymentNullifiers([STANDARD_AUTH_REGISTRY_ADDRESS]);

    return new TXESession(
      logger,
      store,
      stateMachine,
      topLevelOracleHandler,
      contractStore,
      noteStore,
      keyStore,
      addressStore,
      accountStore,
      senderTaggingStore,
      recipientTaggingStore,
      taggingSecretSourcesStore,
      capsuleStore,
      factStore,
      privateEventStore,
      jobCoordinator,
      initialJobId,
      version,
      chainId,
      nextBlockTimestamp,
      artifactResolver,
      rootPath,
      packageName,
    );
  }

  /**
   * Processes an oracle function invoked by the Noir test associated to this session.
   * @param functionName The name of the oracle.
   * @param inputs The inputs of the oracle.
   * @returns The oracle return values.
   */
  processFunction(functionName: TXEOracleFunctionName, inputs: ForeignCallArgs): Promise<ForeignCallResult> {
    try {
      // Oracles retired into the PXE legacy registry have no translator method; dispatch them through the same
      // buildACIRCallback legacy path that contract execution uses, keeping TXE's two oracle paths in sync.
      // Use an own-property check: `in` would match inherited `Object.prototype` keys (e.g. `constructor`), routing
      // them into the legacy path instead of letting them fall through to the unknown-oracle error.
      if (Object.hasOwn(LEGACY_ORACLE_REGISTRY, functionName)) {
        return callTxeLegacyHandler(
          functionName,
          inputs,
          this.oracleHandler as Parameters<typeof buildACIRCallback>[0],
        );
      }

      const translator = new RPCTranslator(this, this.oracleHandler) as any;
      // We perform a runtime validation to check that the function name corresponds to a real oracle handler.
      const validatedFunctionName = z
        .string()
        .refine(fn => typeof translator[fn] === 'function' && !fn.startsWith('handlerAs') && fn !== 'constructor')
        .parse(functionName) as TXEOracleFunctionName;

      return translator[validatedFunctionName](...inputs);
    } catch (error) {
      if (error instanceof z.ZodError) {
        let versionHint: string;
        if (!this.txeOracleVersion) {
          versionHint =
            ' The test appears to use an older version of Aztec.nr that does not' +
            ' support test environment oracle versioning. Update Aztec.nr to a compatible version.' +
            ' See https://docs.aztec.network/errors/12';
        } else if (this.txeOracleVersion.minor > TXE_ORACLE_VERSION_MINOR) {
          versionHint =
            ` The test uses Aztec.nr test oracle version` +
            ` ${this.txeOracleVersion.major}.${this.txeOracleVersion.minor}, but this test environment` +
            ` only supports up to ${TXE_ORACLE_VERSION_MAJOR}.${TXE_ORACLE_VERSION_MINOR}.` +
            ` Upgrade the Aztec CLI to a compatible version.` +
            ` See https://docs.aztec.network/errors/12`;
        } else {
          versionHint =
            ` The test's oracle version (${this.txeOracleVersion.major}.${this.txeOracleVersion.minor})` +
            ` is compatible with this test environment` +
            ` (${TXE_ORACLE_VERSION_MAJOR}.${TXE_ORACLE_VERSION_MINOR}), so this oracle should be` +
            ` available. This is an unexpected error, please report it.` +
            ` See https://docs.aztec.network/errors/13`;
        }
        throw new Error(`Unknown oracle '${functionName}'.${versionHint}`);
      } else if (error instanceof Error) {
        throw new Error(
          `Execution error while processing function ${functionName} in state ${this.state.name}: ${error.message}`,
        );
      } else {
        throw new Error(
          `Unknown execution error while processing function ${functionName} in state ${this.state.name}`,
        );
      }
    }
  }

  /** Commits the current job and begins a new one. Returns the new job ID. */
  private async cycleJob(): Promise<string> {
    await this.jobCoordinator.commitJob(this.currentJobId);
    this.currentJobId = this.jobCoordinator.beginJob();
    return this.currentJobId;
  }

  private resetLastCall(): void {
    const notQueriedMessageCount = this.lastCallInfo.queried
      ? 0
      : this.lastCallInfo.offchainEffects.filter(payload => payload[0]?.equals(OFFCHAIN_MESSAGE_IDENTIFIER)).length;
    if (notQueriedMessageCount > 0) {
      this.logger.warn(
        `Dropping ${notQueriedMessageCount} unqueried offchain message(s) from the previous top-level call. ` +
          `To deliver them, call \`env.offchain_messages()\` and forward the result to the recipient contract's ` +
          `\`offchain_receive\` utility before issuing another top-level call. To intentionally discard, assign ` +
          `to \`let _ = env.offchain_messages()\` to silence this warning.`,
      );
    }
    this.lastCallInfo = emptyLastCallState();
  }

  recordOffchainEffect(data: Fr[]): void {
    this.lastCallInfo.offchainEffects.push(data);
  }

  private setLastCallContext(txHash: Fr, anchorBlockTimestamp: bigint): void {
    this.lastCallInfo.txHash = txHash;
    this.lastCallInfo.anchorBlockTimestamp = anchorBlockTimestamp;
  }

  private async withTopLevelCallTracking<T>(work: () => Promise<{ result: T; txHash?: Fr }>): Promise<T> {
    this.resetLastCall();
    // Capture the anchor *before* `work` runs: private/public executor calls mine a new block as a
    // side effect, and that block's timestamp should not be attributed to this call's anchor.
    const anchorBlockTimestamp = (await this.stateMachine.node.getBlockData('latest'))!.header.globalVariables
      .timestamp;
    const { result, txHash } = await work();
    this.setLastCallContext(txHash ?? Fr.ZERO, anchorBlockTimestamp);
    return result;
  }

  getLastCallOffchainEffects(): { effects: Fr[][] } {
    this.lastCallInfo.queried = true;
    const effects = this.lastCallInfo.offchainEffects;

    if (effects.length > MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY) {
      throw new Error(`${effects.length} offchain effects exceed max ${MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY}`);
    }
    if (effects.some(e => e.length > MAX_OFFCHAIN_EFFECT_LEN)) {
      throw new Error(`Some offchain effect has length larger than max ${MAX_OFFCHAIN_EFFECT_LEN}`);
    }

    return { effects };
  }

  getLastCallContext(): { txHash: Fr; anchorBlockTimestamp: bigint } {
    const { txHash, anchorBlockTimestamp } = this.lastCallInfo;
    return { txHash, anchorBlockTimestamp };
  }

  async executePrivateCall(
    from: Option<AztecAddress>,
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    args: Fr[],
    argsHash: Fr,
    isStaticCall: boolean,
    additionalScopes: AztecAddress[],
    authorizedUtilityCallTargets: AztecAddress[],
    gasSettings: GasSettings,
  ): Promise<Fr[]> {
    const handler = this.handlerAsTxe();
    return await this.withTopLevelCallTracking(async () => {
      const { returnValues, offchainEffects } = await handler.privateCallNewFlow(
        from?.value,
        targetContractAddress,
        functionSelector,
        args,
        argsHash,
        isStaticCall,
        additionalScopes,
        this.currentJobId,
        authorizedUtilityCallTargets,
        gasSettings,
      );

      // Private execution collects offchain effects inside PXE's PrivateExecutionOracle rather than round-tripping
      // them through `aztec_utl_emitOffchainEffect`, so the session buffer is empty at this point. Drain the effects
      // from the execution tree into the session buffer so the next `env.offchain_messages()` call in the test sees
      // them.
      for (const data of offchainEffects) {
        this.recordOffchainEffect(data);
      }

      await this.cycleJob();

      if (isStaticCall) {
        // Static calls revert their checkpoint and mine no block, so there is no tx hash to tag offchain effects
        // with. Querying `getLastTxEffects()` here would return an unrelated predecessor tx.
        return { result: returnValues };
      }
      const { txHash } = await handler.getLastTxEffects();
      return { result: returnValues, txHash: txHash.hash };
    });
  }

  async executeUtilityFunction(
    from: Option<AztecAddress>,
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    args: Fr[],
    authorizedUtilityCallTargets: AztecAddress[],
  ): Promise<Fr[]> {
    const handler = this.handlerAsTxe();
    return await this.withTopLevelCallTracking(async () => {
      const returnValues = await handler.executeUtilityFunction(
        from?.value,
        targetContractAddress,
        functionSelector,
        args,
        this.currentJobId,
        authorizedUtilityCallTargets,
      );

      await this.cycleJob();

      return { result: returnValues };
    });
  }

  async executePublicCall(
    from: Option<AztecAddress>,
    targetContractAddress: AztecAddress,
    calldata: Fr[],
    isStaticCall: boolean,
    gasSettings: GasSettings,
  ): Promise<Fr[]> {
    const handler = this.handlerAsTxe();
    return await this.withTopLevelCallTracking(async () => {
      const returnValues = await handler.publicCallNewFlow(
        from?.value,
        targetContractAddress,
        calldata,
        isStaticCall,
        gasSettings,
      );

      await this.cycleJob();

      if (isStaticCall) {
        // See the equivalent branch in `executePrivateCall`.
        return { result: returnValues };
      }
      const { txHash } = await handler.getLastTxEffects();
      return { result: returnValues, txHash: txHash.hash };
    });
  }

  async getPrivateEvents(selector: EventSelector, contractAddress: AztecAddress, scope: AztecAddress): Promise<Fr[][]> {
    const handler = this.handlerAsTxe();
    await handler.syncContractNonOracleMethod(contractAddress, scope, this.currentJobId);
    // Cycle the job to commit the stores after the contract sync.
    await this.cycleJob();
    return handler.getPrivateEvents(selector, contractAddress, scope);
  }

  private handlerAsTxe(): ITxeExecutionOracle {
    if (!('isTxe' in this.oracleHandler)) {
      throw new UnavailableOracleError('Txe');
    }
    return this.oracleHandler;
  }

  setTxeOracleVersion(major: number, minor: number): void {
    if (major !== TXE_ORACLE_VERSION_MAJOR) {
      const hint =
        major > TXE_ORACLE_VERSION_MAJOR
          ? 'The test was compiled with a newer version of Aztec.nr than your test environment supports. Upgrade your test environment to a compatible version.'
          : 'The test was compiled with an older version of Aztec.nr than your test environment supports. Recompile the test with a compatible version of Aztec.nr.';
      throw new Error(
        `Incompatible test environment version: ${hint} See https://docs.aztec.network/errors/12 (expected test oracle major version ${TXE_ORACLE_VERSION_MAJOR}, got ${major})`,
      );
    }

    this.txeOracleVersion = { major, minor };
    this.logger.debug(`Test compiled with test oracle version ${major}.${minor}`);
  }

  async enterTopLevelState() {
    switch (this.state.name) {
      case 'PRIVATE': {
        await this.exitPrivateState();
        break;
      }
      case 'PUBLIC': {
        await this.exitPublicState();
        break;
      }
      case 'UTILITY': {
        this.exitUtilityContext();
        break;
      }
      case 'TOP_LEVEL': {
        throw new Error(`Expected to be in state other than TOP_LEVEL`);
      }
      default: {
        this.state satisfies never;
      }
    }

    // Commit all staged stores from the job that was just completed, then begin a new job
    await this.cycleJob();

    this.oracleHandler = new TXEOracleTopLevelContext(
      this.stateMachine,
      this.contractStore,
      this.noteStore,
      this.keyStore,
      this.addressStore,
      this.accountStore,
      this.senderTaggingStore,
      this.recipientTaggingStore,
      this.taggingSecretSourcesStore,
      this.capsuleStore,
      this.factStore,
      this.privateEventStore,
      this.nextBlockTimestamp,
      this.version,
      this.chainId,
      this.authwits,
      this.taggingSecretStrategies,
      this.authorizeAllUtilityCallTargets,
      this.artifactResolver,
      this.rootPath,
      this.packageName,
    );

    this.state = { name: 'TOP_LEVEL' };
    this.logger.debug(`Entered state ${this.state.name}`);
  }

  async enterPrivateState(
    contractAddressOpt: Option<AztecAddress>,
    anchorBlockNumberOpt: Option<BlockNumber>,
    gasSettings: GasSettings,
  ): Promise<PrivateContextInputs> {
    const contractAddress = contractAddressOpt?.value ?? DEFAULT_ADDRESS;
    const anchorBlockNumber = anchorBlockNumberOpt?.value;
    this.exitTopLevelState();
    this.resetLastCall();

    // Private execution has two associated block numbers: the anchor block (i.e. the historical block that is used to
    // build the proof), and the *next* block, i.e. the one we'll create once the execution ends, and which will contain
    // a single transaction with the effects of what was done in the test.
    const anchorBlock = await this.stateMachine.node.getBlock(anchorBlockNumber ?? 'latest').then(b => b?.header);

    await new NoteService(this.noteStore, this.stateMachine.node, anchorBlock!, this.currentJobId).syncNoteNullifiers(
      contractAddress,
      await this.keyStore.getAccounts(),
    );
    const latestBlock = await this.stateMachine.node.getBlock('latest').then(b => b?.header);

    const nextBlockGlobalVariables = makeGlobalVariables(undefined, {
      blockNumber: BlockNumber(latestBlock!.globalVariables.blockNumber + 1),
      timestamp: this.nextBlockTimestamp,
      version: this.version,
      chainId: this.chainId,
    });

    const txRequestHash = getSingleTxBlockRequestHash(nextBlockGlobalVariables.blockNumber);
    const protocolNullifier = await computeProtocolNullifier(txRequestHash);
    const noteCache = new ExecutionNoteCache(protocolNullifier);
    const taggingIndexCache = new ExecutionTaggingIndexCache();

    const utilityExecutor = this.utilityExecutorForContractSync(anchorBlock);
    const transientArrayService = new TransientArrayService();
    const anchoredContractData = new AnchoredContractData(
      this.contractStore,
      this.stateMachine.contractClassService,
      anchorBlock!,
    );
    this.oracleHandler = new TXEPrivateExecutionOracle({
      argsHash: Fr.ZERO,
      txContext: new TxContext(this.chainId, this.version, gasSettings),
      txRequestSalt: Fr.ZERO,
      callContext: new CallContext(AztecAddress.ZERO, contractAddress, FunctionSelector.empty(), false),
      anchorBlockHeader: anchorBlock!,
      utilityExecutor,
      authWitnesses: [],
      capsules: [],
      executionCache: new HashedValuesCache(),
      noteCache,
      taggingIndexCache,
      anchoredContractData,
      noteStore: this.noteStore,
      keyStore: this.keyStore,
      addressStore: this.addressStore,
      aztecNode: this.stateMachine.node,
      senderTaggingStore: this.senderTaggingStore,
      recipientTaggingStore: this.recipientTaggingStore,
      taggingSecretSourcesStore: this.taggingSecretSourcesStore,
      capsuleService: new CapsuleService(this.capsuleStore, await this.keyStore.getAccounts()),
      factService: new FactService(this.factStore, await this.keyStore.getAccounts()),
      privateEventStore: this.privateEventStore,
      contractSyncService: this.stateMachine.contractSyncService,
      l2TipsStore: this.stateMachine.l2TipsProvider,
      jobId: this.currentJobId,
      scopes: await this.keyStore.getAccounts(),
      txResolver: this.stateMachine.txResolver,
      simulator: new WASMSimulator(),
      hooks: this.buildExecutionHooks(),
      transientArrayService,
    });

    // We store the note and tagging index caches fed into the PrivateExecutionOracle (along with some other auxiliary
    // data) in order to refer to it later, mimicking the way this object is used by the ContractFunctionSimulator. The
    // difference resides in that the simulator has all information needed in order to run the simulation, while ours
    // will be ongoing as the different oracles will be invoked from the Noir test, until eventually the private
    // execution finishes.
    this.state = { name: 'PRIVATE', nextBlockGlobalVariables, noteCache, taggingIndexCache };
    this.logger.debug(`Entered state ${this.state.name}`);

    // Record the *resolved* anchor's timestamp — if the caller pinned the anchor to a past block
    // via `anchorBlockNumber`, "latest" would be the wrong anchor for offchain-message semantics.
    this.setLastCallContext(Fr.ZERO, anchorBlock!.globalVariables.timestamp);

    return (this.oracleHandler as TXEPrivateExecutionOracle).getPrivateContextInputs();
  }

  async enterPublicState(contractAddressOpt: Option<AztecAddress>) {
    const contractAddress = contractAddressOpt?.value ?? DEFAULT_ADDRESS;
    this.exitTopLevelState();
    this.resetLastCall();

    // The PublicContext will create a block with a single transaction in it, containing the effects of what was done in
    // the test. The block therefore gets the *next* block number and timestamp.
    const latestHeader = (await this.stateMachine.node.getBlockData('latest'))!.header;
    const globalVariables = makeGlobalVariables(undefined, {
      blockNumber: BlockNumber(latestHeader.globalVariables.blockNumber + 1),
      timestamp: this.nextBlockTimestamp,
      version: this.version,
      chainId: this.chainId,
    });

    this.oracleHandler = new TXEOraclePublicContext(
      contractAddress,
      await this.stateMachine.synchronizer.nativeWorldStateService.fork(),
      getSingleTxBlockRequestHash(globalVariables.blockNumber),
      globalVariables,
      this.contractStore,
    );

    this.state = { name: 'PUBLIC' };
    this.logger.debug(`Entered state ${this.state.name}`);

    // Public state is anchored at the latest block.
    this.setLastCallContext(Fr.ZERO, latestHeader.globalVariables.timestamp);
  }

  async enterUtilityState(contractAddressOpt: Option<AztecAddress>) {
    const contractAddress = contractAddressOpt?.value ?? DEFAULT_ADDRESS;
    this.exitTopLevelState();
    this.resetLastCall();

    const anchorBlockHeader = await this.stateMachine.anchorBlockStore.getBlockHeader();

    // There is no automatic message discovery and contract-driven syncing process in inlined private or utility
    // contexts, which means that known nullifiers are also not searched for, since it is during the tagging sync that
    // we perform this. We therefore search for known nullifiers now, as otherwise notes that were nullified would not
    // be removed from the database.
    // TODO(#12553): make the synchronizer sync here instead and remove this
    await new NoteService(
      this.noteStore,
      this.stateMachine.node,
      anchorBlockHeader,
      this.currentJobId,
    ).syncNoteNullifiers(contractAddress, await this.keyStore.getAccounts());

    this.oracleHandler = new UtilityExecutionOracle({
      callContext: CallContext.from({
        msgSender: AztecAddress.NULL_MSG_SENDER,
        contractAddress,
        // No specific function is being executed in this inlined utility context, hence the empty selector.
        functionSelector: FunctionSelector.empty(),
        isStaticCall: true,
      }),
      authWitnesses: [],
      capsules: [],
      anchorBlockHeader,
      anchoredContractData: new AnchoredContractData(
        this.contractStore,
        this.stateMachine.contractClassService,
        anchorBlockHeader,
      ),
      noteStore: this.noteStore,
      keyStore: this.keyStore,
      addressStore: this.addressStore,
      aztecNode: this.stateMachine.node,
      recipientTaggingStore: this.recipientTaggingStore,
      taggingSecretSourcesStore: this.taggingSecretSourcesStore,
      capsuleService: new CapsuleService(this.capsuleStore, await this.keyStore.getAccounts()),
      factService: new FactService(this.factStore, await this.keyStore.getAccounts()),
      privateEventStore: this.privateEventStore,
      txResolver: this.stateMachine.txResolver,
      contractSyncService: this.stateMachine.contractSyncService,
      l2TipsStore: this.stateMachine.l2TipsProvider,
      jobId: this.currentJobId,
      scopes: await this.keyStore.getAccounts(),
      simulator: new WASMSimulator(),
      utilityExecutor: this.utilityExecutorForContractSync(anchorBlockHeader),
      hooks: this.buildExecutionHooks(),
      // Execution-tree root (top-level utility run): own store; nested frames inherit it.
      transientArrayService: new TransientArrayService(),
    });

    this.state = { name: 'UTILITY' };
    this.logger.debug(`Entered state ${this.state.name}`);

    // Utility state anchors at whatever the anchor block store is pointing to (tracked as latest).
    this.setLastCallContext(Fr.ZERO, anchorBlockHeader.globalVariables.timestamp);
  }

  private exitTopLevelState() {
    if (this.state.name != 'TOP_LEVEL') {
      throw new Error(`Expected to be in state 'TOP_LEVEL', but got '${this.state.name}' instead`);
    }

    // Note that while all public and private contexts do is build a single block that we then process when exiting
    // them, the top level context does most of its work as it goes: it creates empty blocks (via `advanceBlocksBy`
    // and `deploy`), creates blocks with transactions (via `privateCallNewFlow` and `publicCallNewFlow`), adds
    // accounts to PXE (via `addAccount`), etc. This is a slight inconsistency in the working model of this class, but
    // is not too bad. The `close` call below therefore only hands back the session-scoped values that a test
    // sets directly at the top level, outside any contract execution (e.g. via `advanceTimestampBy`,
    // `addAuthWitness`, `setTaggingSecretStrategies`). The oracle handler is discarded on every state transition,
    // so the session must seed these values into the contexts it creates later.

    // TODO: persisting authwits this way is quite unfortunate: they create a temporary utility context that would
    // otherwise reset them, so we'd not be able to pass more than one per execution. Ideally authwits would be passed
    // alongside a contract call instead of pre-seeded.
    ({
      nextBlockTimestamp: this.nextBlockTimestamp,
      authwits: this.authwits,
      taggingSecretStrategies: this.taggingSecretStrategies,
      authorizeAllUtilityCallTargets: this.authorizeAllUtilityCallTargets,
    } = (this.oracleHandler as TXEOracleTopLevelContext).close());
  }

  private async exitPrivateState() {
    if (this.state.name != 'PRIVATE') {
      throw new Error(`Expected to be in state 'PRIVATE', but got '${this.state.name}' instead`);
    }

    this.logger.debug('Exiting Private state, building block with collected side effects', {
      blockNumber: this.state.nextBlockGlobalVariables.blockNumber,
    });

    // We rely on the note cache to determine the effects of the transaction. This is incomplete as it doesn't private
    // logs (other effects like enqueued public calls don't need to be considered since those are not allowed).

    const txEffect = await makeTxEffect(this.state.noteCache, this.state.nextBlockGlobalVariables.blockNumber);

    // We build a block holding just this transaction
    const forkedWorldTrees = await this.stateMachine.synchronizer.nativeWorldStateService.fork();
    await insertTxEffectIntoWorldTrees(txEffect, forkedWorldTrees);

    const block = await makeTXEBlock(forkedWorldTrees, this.state.nextBlockGlobalVariables, [txEffect]);
    await this.stateMachine.handleL2Block(block);

    await forkedWorldTrees.close();

    this.logger.debug('Exited PublicContext with built block', {
      blockNumber: block.number,
      txEffects: block.body.txEffects,
    });
  }

  private async exitPublicState() {
    if (this.state.name != 'PUBLIC') {
      throw new Error(`Expected to be in state 'PUBLIC', but got '${this.state.name}' instead`);
    }

    const block = await (this.oracleHandler as TXEOraclePublicContext).close();
    await this.stateMachine.handleL2Block(block);
  }

  private exitUtilityContext() {
    if (this.state.name != 'UTILITY') {
      throw new Error(`Expected to be in state 'UTILITY', but got '${this.state.name}' instead`);
    }
  }

  private utilityExecutorForContractSync(anchorBlock: any) {
    return async (call: FunctionCall, scopes: AztecAddress[]) => {
      const anchoredContractData = new AnchoredContractData(
        this.contractStore,
        this.stateMachine.contractClassService,
        anchorBlock!,
      );
      const entryPointArtifact = await anchoredContractData.getFunctionArtifactWithDebugMetadata(
        call.to,
        call.selector,
      );
      if (!entryPointArtifact) {
        throw new Error(`Cannot run function ${call.selector} on ${call.to}: the contract is not registered.`);
      }
      if (entryPointArtifact.functionType !== FunctionType.UTILITY) {
        throw new Error(`Cannot run ${entryPointArtifact.functionType} function as utility`);
      }

      try {
        const simulator = new WASMSimulator();
        const oracle = new UtilityExecutionOracle({
          callContext: CallContext.from({
            msgSender: AztecAddress.NULL_MSG_SENDER,
            contractAddress: call.to,
            functionSelector: call.selector,
            isStaticCall: true,
          }),
          authWitnesses: [],
          capsules: [],
          anchorBlockHeader: anchorBlock!,
          anchoredContractData,
          noteStore: this.noteStore,
          keyStore: this.keyStore,
          addressStore: this.addressStore,
          aztecNode: this.stateMachine.node,
          recipientTaggingStore: this.recipientTaggingStore,
          taggingSecretSourcesStore: this.taggingSecretSourcesStore,
          capsuleService: new CapsuleService(this.capsuleStore, scopes),
          factService: new FactService(this.factStore, scopes),
          privateEventStore: this.privateEventStore,
          txResolver: this.stateMachine.txResolver,
          contractSyncService: this.stateMachine.contractSyncService,
          l2TipsStore: this.stateMachine.l2TipsProvider,
          jobId: this.currentJobId,
          scopes,
          simulator,
          utilityExecutor: this.utilityExecutorForContractSync(anchorBlock),
          hooks: this.buildExecutionHooks(),
          // Top-level utility entrypoint: gets a fresh store. Nested frames inherit it via UtilityExecutionOracle.
          transientArrayService: new TransientArrayService(),
        });
        await simulator
          .executeUserCircuit(toACVMWitness(0, call.args), entryPointArtifact, buildACIRCallback(oracle))
          .catch((err: Error) => {
            err.message = resolveAssertionMessageFromError(err, entryPointArtifact);
            throw new ExecutionError(
              err.message,
              {
                contractAddress: call.to,
                functionSelector: call.selector,
              },
              extractCallStack(err, entryPointArtifact.debug),
              { cause: err },
            );
          });
      } catch (err) {
        throw createSimulationError(err instanceof Error ? err : new Error('Unknown error contract data sync'));
      }
    };
  }

  /** Execution hooks for the oracles this session builds. Every oracle construction site must use this. */
  private buildExecutionHooks() {
    return composeHooks({
      resolveTaggingSecretStrategy: makeResolveTaggingSecretStrategyHook(this.taggingSecretStrategies),
      authorizeUtilityCall: this.authorizeAllUtilityCallTargets ? authorizeAllUtilityCallsHook : undefined,
    });
  }
}
