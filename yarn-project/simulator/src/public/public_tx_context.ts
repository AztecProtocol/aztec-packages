import {
  type AvmProvingRequest,
  MerkleTreeId,
  type MerkleTreeReadOperations,
  type PublicExecutionRequest,
  type SimulationError,
  type Tx,
  TxExecutionPhase,
  TxHash,
} from '@aztec/circuit-types';
import {
  type AvmCircuitPublicInputs,
  Fr,
  Gas,
  type GasSettings,
  type GlobalVariables,
  type Header,
  type PrivateToPublicAccumulatedData,
  type PublicCallRequest,
  RevertCode,
  type StateReference,
  countAccumulatedItems,
} from '@aztec/circuits.js';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';

import { strict as assert } from 'assert';
import { inspect } from 'util';

import { type AvmFinalizedCallResult } from '../avm/avm_contract_call_result.js';
import { AvmPersistableStateManager } from '../avm/index.js';
import { DualSideEffectTrace } from './dual_side_effect_trace.js';
import { PublicEnqueuedCallSideEffectTrace, SideEffectArrayLengths } from './enqueued_call_side_effect_trace.js';
import { type WorldStateDB } from './public_db_sources.js';
import { PublicSideEffectTrace } from './side_effect_trace.js';
import { generateAvmCircuitPublicInputs, generateAvmProvingRequest } from './transitional_adapters.js';
import { getCallRequestsByPhase, getExecutionRequestsByPhase } from './utils.js';

/**
 * The transaction-level context for public execution.
 */
export class PublicTxContext {
  private log: DebugLogger;

  /* Gas used including private, teardown gas _limit_, setup and app logic */
  private gasUsed: Gas;
  /* Gas actually used during teardown (different from limit) */
  public teardownGasUsed: Gas = Gas.empty();

  /* Entire transaction execution is done. */
  private halted = false;
  /* Where did reverts happen (if at all)? */
  private revertCode: RevertCode = RevertCode.OK;
  /* What caused a revert (if one occurred)? */
  public revertReason: SimulationError | undefined;

  public avmProvingRequest: AvmProvingRequest | undefined; // FIXME(dbanks12): remove

  constructor(
    public readonly state: PhaseStateManager,
    private readonly globalVariables: GlobalVariables,
    private readonly historicalHeader: Header, // FIXME(dbanks12): remove
    private readonly startStateReference: StateReference,
    private readonly startGasUsed: Gas,
    private readonly gasSettings: GasSettings,
    private readonly setupCallRequests: PublicCallRequest[],
    private readonly appLogicCallRequests: PublicCallRequest[],
    private readonly teardownCallRequests: PublicCallRequest[],
    private readonly setupExecutionRequests: PublicExecutionRequest[],
    private readonly appLogicExecutionRequests: PublicExecutionRequest[],
    private readonly teardownExecutionRequests: PublicExecutionRequest[],
    public readonly nonRevertibleAccumulatedDataFromPrivate: PrivateToPublicAccumulatedData,
    public readonly revertibleAccumulatedDataFromPrivate: PrivateToPublicAccumulatedData,
    public trace: PublicEnqueuedCallSideEffectTrace, // FIXME(dbanks12): should be private
  ) {
    this.log = createDebugLogger(`aztec:public_tx_context`);
    this.gasUsed = startGasUsed;
  }

  public static async create(
    db: MerkleTreeReadOperations,
    worldStateDB: WorldStateDB,
    tx: Tx,
    globalVariables: GlobalVariables,
    doMerkleOperations: boolean,
  ) {
    const nonRevertibleAccumulatedDataFromPrivate = tx.data.forPublic!.nonRevertibleAccumulatedData;

    const innerCallTrace = new PublicSideEffectTrace();
    const previousAccumulatedDataArrayLengths = new SideEffectArrayLengths(
      /*publicDataWrites*/ 0,
      countAccumulatedItems(nonRevertibleAccumulatedDataFromPrivate.noteHashes),
      countAccumulatedItems(nonRevertibleAccumulatedDataFromPrivate.nullifiers),
      countAccumulatedItems(nonRevertibleAccumulatedDataFromPrivate.l2ToL1Msgs),
      /*unencryptedLogsHashes*/ 0,
    );
    const enqueuedCallTrace = new PublicEnqueuedCallSideEffectTrace(
      /*startSideEffectCounter=*/ 0,
      previousAccumulatedDataArrayLengths,
    );
    const trace = new DualSideEffectTrace(innerCallTrace, enqueuedCallTrace);

    // Transaction level state manager that will be forked for revertible phases.
    const txStateManager = await AvmPersistableStateManager.create(worldStateDB, trace, doMerkleOperations);

    return new PublicTxContext(
      new PhaseStateManager(txStateManager),
      globalVariables,
      tx.data.constants.historicalHeader,
      await db.getStateReference(),
      tx.data.gasUsed,
      tx.data.constants.txContext.gasSettings,
      getCallRequestsByPhase(tx, TxExecutionPhase.SETUP),
      getCallRequestsByPhase(tx, TxExecutionPhase.APP_LOGIC),
      getCallRequestsByPhase(tx, TxExecutionPhase.TEARDOWN),
      getExecutionRequestsByPhase(tx, TxExecutionPhase.SETUP),
      getExecutionRequestsByPhase(tx, TxExecutionPhase.APP_LOGIC),
      getExecutionRequestsByPhase(tx, TxExecutionPhase.TEARDOWN),
      tx.data.forPublic!.nonRevertibleAccumulatedData,
      tx.data.forPublic!.revertibleAccumulatedData,
      enqueuedCallTrace,
    );
  }

  /**
   * Signal that the entire transaction execution is done.
   * All phases have been processed.
   * Actual transaction fee and actual total consumed gas can now be queried.
   */
  halt() {
    if (this.state.isForked()) {
      this.state.mergeForkedState();
    }
    this.halted = true;
  }

  /**
   * Revert execution a phase. Populate revertReason & revertCode.
   * If in setup, throw an error (transaction will be thrown out).
   * NOTE: this does not "halt" the entire transaction execution.
   */
  revert(phase: TxExecutionPhase, revertReason: SimulationError | undefined = undefined, culprit = '') {
    this.log.debug(`${TxExecutionPhase[phase]} phase reverted! ${culprit} failed with reason: ${revertReason}`);

    if (revertReason && !this.revertReason) {
      // don't override revertReason
      // (if app logic and teardown both revert, we want app logic's reason)
      this.revertReason = revertReason;
    }
    if (phase === TxExecutionPhase.SETUP) {
      this.log.debug(`Setup phase reverted! The transaction will be thrown out.`);
      if (revertReason) {
        throw revertReason;
      } else {
        throw new Error(`Setup phase reverted! The transaction will be thrown out. ${culprit} failed`);
      }
    } else if (phase === TxExecutionPhase.APP_LOGIC) {
      this.revertCode = RevertCode.APP_LOGIC_REVERTED;
    } else if (phase === TxExecutionPhase.TEARDOWN) {
      if (this.revertCode.equals(RevertCode.APP_LOGIC_REVERTED)) {
        this.revertCode = RevertCode.BOTH_REVERTED;
      } else {
        this.revertCode = RevertCode.TEARDOWN_REVERTED;
      }
    }
  }

  /**
   * Get the revert code.
   * @returns The revert code.
   */
  getFinalRevertCode(): RevertCode {
    assert(this.halted, 'Cannot know the final revert code until tx execution ends');
    return this.revertCode;
  }

  /**
   * Construct & return transaction hash.
   * @returns The transaction's hash.
   */
  getTxHash(): TxHash {
    // Private kernel functions are executed client side and for this reason tx hash is already set as first nullifier
    const firstNullifier = this.nonRevertibleAccumulatedDataFromPrivate.nullifiers[0];
    if (!firstNullifier || firstNullifier.isZero()) {
      throw new Error(`Cannot get tx hash since first nullifier is missing`);
    }
    return new TxHash(firstNullifier.toBuffer());
  }

  /**
   * Are there any call requests for the speciiied phase?
   */
  hasPhase(phase: TxExecutionPhase): boolean {
    if (phase === TxExecutionPhase.SETUP) {
      return this.setupCallRequests.length > 0;
    } else if (phase === TxExecutionPhase.APP_LOGIC) {
      return this.appLogicCallRequests.length > 0;
    } else {
      // phase === TxExecutionPhase.TEARDOWN
      return this.teardownCallRequests.length > 0;
    }
  }

  /**
   * Get the call requests for the specified phase (including args hashes).
   */
  getCallRequestsForPhase(phase: TxExecutionPhase): PublicCallRequest[] {
    switch (phase) {
      case TxExecutionPhase.SETUP:
        return this.setupCallRequests;
      case TxExecutionPhase.APP_LOGIC:
        return this.appLogicCallRequests;
      case TxExecutionPhase.TEARDOWN:
        return this.teardownCallRequests;
    }
  }

  /**
   * Get the call requests for the specified phase (including actual args).
   */
  getExecutionRequestsForPhase(phase: TxExecutionPhase): PublicExecutionRequest[] {
    switch (phase) {
      case TxExecutionPhase.SETUP:
        return this.setupExecutionRequests;
      case TxExecutionPhase.APP_LOGIC:
        return this.appLogicExecutionRequests;
      case TxExecutionPhase.TEARDOWN:
        return this.teardownExecutionRequests;
    }
  }

  /**
   * How much gas is left for the specified phase?
   */
  getGasLeftForPhase(phase: TxExecutionPhase): Gas {
    if (phase === TxExecutionPhase.TEARDOWN) {
      return this.gasSettings.teardownGasLimits;
    } else {
      return this.gasSettings.gasLimits.sub(this.gasUsed);
    }
  }

  /**
   * Consume gas. Track gas for teardown phase separately.
   */
  consumeGas(phase: TxExecutionPhase, gas: Gas) {
    if (phase === TxExecutionPhase.TEARDOWN) {
      this.teardownGasUsed = this.teardownGasUsed.add(gas);
    } else {
      this.gasUsed = this.gasUsed.add(gas);
    }
  }

  /**
   * Compute the gas used using the actual gas used during teardown instead
   * of the teardown gas limit.
   * Note that this.gasUsed is initialized from private's gasUsed which includes
   * teardown gas limit.
   */
  getActualGasUsed(): Gas {
    assert(this.halted, 'Can only compute actual gas used after tx execution ends');
    const requireTeardown = this.teardownCallRequests.length > 0;
    const teardownGasLimits = requireTeardown ? this.gasSettings.teardownGasLimits : Gas.empty();
    return this.gasUsed.sub(teardownGasLimits).add(this.teardownGasUsed);
  }

  /**
   * The gasUsed as if the entire teardown gas limit was consumed.
   */
  getGasUsedForFee(): Gas {
    return this.gasUsed;
  }

  /**
   * Get the transaction fee as is available to the specified phase.
   * Only teardown should have access to the actual transaction fee.
   */
  getTransactionFee(phase: TxExecutionPhase): Fr {
    if (phase === TxExecutionPhase.TEARDOWN) {
      return this.getTransactionFeeUnsafe();
    } else {
      return Fr.zero();
    }
  }

  /**
   * Compute the transaction fee.
   * Should only be called during or after teardown.
   */
  private getTransactionFeeUnsafe(): Fr {
    const txFee = this.gasUsed.computeFee(this.globalVariables.gasFees);
    this.log.debug(`Computed tx fee`, {
      txFee,
      gasUsed: inspect(this.gasUsed),
      gasFees: inspect(this.globalVariables.gasFees),
    });
    return txFee;
  }

  /**
   * Generate the public inputs for the AVM circuit.
   */
  private generateAvmCircuitPublicInputs(endStateReference: StateReference): AvmCircuitPublicInputs {
    assert(this.halted, 'Can only get AvmCircuitPublicInputs after tx execution ends');
    // TODO(dbanks12): use the state roots from ephemeral trees
    endStateReference.partial.nullifierTree.root = this.state
      .getActiveStateManager()
      .merkleTrees.treeMap.get(MerkleTreeId.NULLIFIER_TREE)!
      .getRoot();
    return generateAvmCircuitPublicInputs(
      this.trace,
      this.globalVariables,
      this.startStateReference,
      this.startGasUsed,
      this.gasSettings,
      this.setupCallRequests,
      this.appLogicCallRequests,
      this.teardownCallRequests,
      this.nonRevertibleAccumulatedDataFromPrivate,
      this.revertibleAccumulatedDataFromPrivate,
      endStateReference,
      /*endGasUsed=*/ this.gasUsed,
      this.getTransactionFeeUnsafe(),
      this.revertCode,
    );
  }

  /**
   * Generate the proving request for the AVM circuit.
   */
  generateProvingRequest(endStateReference: StateReference): AvmProvingRequest {
    // TODO(dbanks12): Once we actually have tx-level proving, this will generate the entire
    // proving request for the first time
    this.avmProvingRequest!.inputs.output = this.generateAvmCircuitPublicInputs(endStateReference);
    return this.avmProvingRequest!;
  }

  // TODO(dbanks12): remove once AVM proves entire public tx
  updateProvingRequest(
    real: boolean,
    phase: TxExecutionPhase,
    fnName: string,
    stateManager: AvmPersistableStateManager,
    executionRequest: PublicExecutionRequest,
    result: AvmFinalizedCallResult,
    allocatedGas: Gas,
  ) {
    if (this.avmProvingRequest === undefined) {
      // Propagate the very first avmProvingRequest of the tx for now.
      // Eventually this will be the proof for the entire public portion of the transaction.
      this.avmProvingRequest = generateAvmProvingRequest(
        real,
        fnName,
        stateManager,
        this.historicalHeader,
        this.globalVariables,
        executionRequest,
        // TODO(dbanks12): do we need this return type unless we are doing an isolated call?
        stateManager.trace.toPublicEnqueuedCallExecutionResult(result),
        allocatedGas,
        this.getTransactionFee(phase),
      );
    }
  }
}

/**
 * Thin wrapper around the state manager to handle forking and merging for phases.
 *
 * This lets us keep track of whether the state has already been forked
 * so that we can conditionally fork at the start of a phase.
 *
 * There is a state manager that lives at the level of the entire transaction,
 * but for app logic and teardown the active state manager will be a fork of the
 * transaction level one.
 */
class PhaseStateManager {
  private log: DebugLogger;

  private currentlyActiveStateManager: AvmPersistableStateManager | undefined;

  constructor(private readonly txStateManager: AvmPersistableStateManager) {
    this.log = createDebugLogger(`aztec:public_phase_state_manager`);
  }

  fork() {
    assert(!this.currentlyActiveStateManager, 'Cannot fork when already forked');
    this.log.debug(`Forking phase state manager`);
    this.currentlyActiveStateManager = this.txStateManager.fork();
  }

  getActiveStateManager() {
    return this.currentlyActiveStateManager || this.txStateManager;
  }

  isForked() {
    return !!this.currentlyActiveStateManager;
  }

  mergeForkedState() {
    assert(this.currentlyActiveStateManager, 'No forked state to merge');
    this.log.debug(`Merging in forked state`);
    this.txStateManager.merge(this.currentlyActiveStateManager!);
    // Drop the forked state manager now that it is merged
    this.currentlyActiveStateManager = undefined;
  }

  discardForkedState() {
    this.log.debug(`Discarding forked state`);
    assert(this.currentlyActiveStateManager, 'No forked state to discard');
    this.txStateManager.reject(this.currentlyActiveStateManager!);
    // Drop the forked state manager. We don't want it!
    this.currentlyActiveStateManager = undefined;
  }
}
