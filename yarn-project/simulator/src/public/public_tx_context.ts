import {
  type AvmProvingRequest,
  type MerkleTreeReadOperations,
  type PublicExecutionRequest,
  type SimulationError,
  type Tx,
  TxExecutionPhase,
} from '@aztec/circuit-types';
import {
  CombinedConstantData,
  Fr,
  Gas,
  type GasSettings,
  type GlobalVariables,
  PublicAccumulatedDataArrayLengths,
  type PublicCallRequest,
  type PublicKernelCircuitPublicInputs,
  PublicValidationRequestArrayLengths,
  RevertCode,
  type StateReference,
} from '@aztec/circuits.js';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';

import { assert } from 'console';
import { inspect } from 'util';

import { AvmPersistableStateManager } from '../avm/index.js';
import { DualSideEffectTrace } from './dual_side_effect_trace.js';
import { PublicEnqueuedCallSideEffectTrace } from './enqueued_call_side_effect_trace.js';
import { type WorldStateDB } from './public_db_sources.js';
import { PublicSideEffectTrace } from './side_effect_trace.js';
import { getCallRequestsByPhase, getExecutionRequestsByPhase, getPublicKernelCircuitPublicInputs } from './utils.js';

class PhaseStateManager {
  private currentlyActiveStateManager: AvmPersistableStateManager | undefined;

  constructor(private readonly txStateManager: AvmPersistableStateManager) {}

  fork() {
    assert(!this.currentlyActiveStateManager, 'Cannot fork when already forked');
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
    this.txStateManager.mergeForkedState(this.currentlyActiveStateManager!);
    // Drop the forked state manager now that it is merged
    this.currentlyActiveStateManager = undefined;
  }

  discardForkedState() {
    assert(this.currentlyActiveStateManager, 'No forked state to discard');
    this.txStateManager.rejectForkedState(this.currentlyActiveStateManager!);
    // Drop the forked state manager. We don't want it!
    this.currentlyActiveStateManager = undefined;
  }
}

export class PublicTxContext {
  private log: DebugLogger;

  private currentPhase: TxExecutionPhase = TxExecutionPhase.SETUP;

  /* Gas used including private, teardown gas _limit_, setup and app logic */
  private gasUsed: Gas;
  /* Gas actually used during teardown (different from limit) */
  public teardownGasUsed: Gas = Gas.empty();

  public revertCode: RevertCode = RevertCode.OK;
  public revertReason: SimulationError | undefined;

  public avmProvingRequest: AvmProvingRequest | undefined; // tmp hack

  constructor(
    public readonly state: PhaseStateManager,
    public readonly tx: Tx, // tmp hack
    public readonly globalVariables: GlobalVariables,
    public readonly constants: CombinedConstantData, // tmp hack
    public readonly startStateReference: StateReference,
    startGasUsed: Gas,
    private readonly gasSettings: GasSettings,
    private readonly setupCallRequests: PublicCallRequest[],
    private readonly appLogicCallRequests: PublicCallRequest[],
    private readonly teardownCallRequests: PublicCallRequest[],
    private readonly setupExecutionRequests: PublicExecutionRequest[],
    private readonly appLogicExecutionRequests: PublicExecutionRequest[],
    private readonly teardownExecutionRequests: PublicExecutionRequest[],
    public latestPublicKernelOutput: PublicKernelCircuitPublicInputs,
    public trace: PublicEnqueuedCallSideEffectTrace,
  ) {
    this.log = createDebugLogger(`aztec:public_tx_context`);
    this.gasUsed = startGasUsed;
  }

  public static async create(
    db: MerkleTreeReadOperations,
    worldStateDB: WorldStateDB,
    tx: Tx,
    globalVariables: GlobalVariables,
  ) {
    const privateKernelOutput = tx.data;
    const latestPublicKernelOutput = getPublicKernelCircuitPublicInputs(privateKernelOutput, globalVariables);

    const nonRevertibleNullifiersFromPrivate = latestPublicKernelOutput.endNonRevertibleData.nullifiers
      .filter(n => !n.isEmpty())
      .map(n => n.value);
    const _revertibleNullifiersFromPrivate = latestPublicKernelOutput.end.nullifiers
      .filter(n => !n.isEmpty())
      .map(n => n.value);

    // During SETUP, non revertible side effects from private are our "previous data"
    const prevAccumulatedData = latestPublicKernelOutput.endNonRevertibleData;
    const previousValidationRequestArrayLengths = PublicValidationRequestArrayLengths.new(
      latestPublicKernelOutput.validationRequests,
    );

    const previousAccumulatedDataArrayLengths = PublicAccumulatedDataArrayLengths.new(prevAccumulatedData);

    const innerCallTrace = new PublicSideEffectTrace();
    const enqueuedCallTrace = new PublicEnqueuedCallSideEffectTrace(
      /*startSideEffectCounter=*/ 0,
      previousValidationRequestArrayLengths,
      previousAccumulatedDataArrayLengths,
    );
    const trace = new DualSideEffectTrace(innerCallTrace, enqueuedCallTrace);

    // Transaction level state manager that will be forked for revertible phases.
    const txStateManager = AvmPersistableStateManager.newWithPendingSiloedNullifiers(
      worldStateDB,
      trace,
      nonRevertibleNullifiersFromPrivate,
    );

    return new PublicTxContext(
      new PhaseStateManager(txStateManager),
      tx,
      globalVariables,
      CombinedConstantData.combine(tx.data.constants, globalVariables),
      await db.getStateReference(),
      tx.data.gasUsed,
      tx.data.constants.txContext.gasSettings,
      getCallRequestsByPhase(tx, TxExecutionPhase.SETUP),
      getCallRequestsByPhase(tx, TxExecutionPhase.APP_LOGIC),
      getCallRequestsByPhase(tx, TxExecutionPhase.TEARDOWN),
      getExecutionRequestsByPhase(tx, TxExecutionPhase.SETUP),
      getExecutionRequestsByPhase(tx, TxExecutionPhase.APP_LOGIC),
      getExecutionRequestsByPhase(tx, TxExecutionPhase.TEARDOWN),
      latestPublicKernelOutput,
      enqueuedCallTrace,
    );
  }

  getCurrentPhase(): TxExecutionPhase {
    return this.currentPhase;
  }

  hasPhase(phase: TxExecutionPhase = this.currentPhase): boolean {
    if (phase === TxExecutionPhase.SETUP) {
      return this.setupCallRequests.length > 0;
    } else if (phase === TxExecutionPhase.APP_LOGIC) {
      return this.appLogicCallRequests.length > 0;
    } else {
      // phase === TxExecutionPhase.TEARDOWN
      return this.teardownCallRequests.length > 0;
    }
  }

  progressToNextPhase() {
    assert(this.currentPhase !== TxExecutionPhase.TEARDOWN, 'Cannot progress past teardown');
    if (this.currentPhase === TxExecutionPhase.SETUP) {
      this.currentPhase = TxExecutionPhase.APP_LOGIC;
    } else {
      this.currentPhase = TxExecutionPhase.TEARDOWN;
    }
  }

  revert(revertReason: SimulationError | undefined = undefined, culprit = '') {
    this.log.debug(
      `${TxExecutionPhase[this.currentPhase]} phase reverted! ${culprit} failed with reason: ${revertReason}`,
    );
    if (revertReason && !this.revertReason) {
      // don't override revertReason
      // (if app logic and teardown both revert, we want app logic's reason)
      this.revertReason = revertReason;
    }
    if (this.currentPhase === TxExecutionPhase.SETUP) {
      this.log.debug(`Setup phase reverted! The transaction will be thrown out.`);
      if (revertReason) {
        throw revertReason;
      } else {
        throw new Error(`Setup phase reverted! The transaction will be thrown out. ${culprit} failed`);
      }
    } else if (this.currentPhase === TxExecutionPhase.APP_LOGIC) {
      this.revertCode = RevertCode.APP_LOGIC_REVERTED;
    } else if (this.currentPhase === TxExecutionPhase.TEARDOWN) {
      if (this.revertCode.equals(RevertCode.APP_LOGIC_REVERTED)) {
        this.revertCode = RevertCode.BOTH_REVERTED;
      } else {
        this.revertCode = RevertCode.TEARDOWN_REVERTED;
      }
    }
  }

  getCallRequestsForCurrentPhase(): PublicCallRequest[] {
    switch (this.currentPhase) {
      case TxExecutionPhase.SETUP:
        return this.setupCallRequests;
      case TxExecutionPhase.APP_LOGIC:
        return this.appLogicCallRequests;
      case TxExecutionPhase.TEARDOWN:
        return this.teardownCallRequests;
    }
  }

  getExecutionRequestsForCurrentPhase(): PublicExecutionRequest[] {
    switch (this.currentPhase) {
      case TxExecutionPhase.SETUP:
        return this.setupExecutionRequests;
      case TxExecutionPhase.APP_LOGIC:
        return this.appLogicExecutionRequests;
      case TxExecutionPhase.TEARDOWN:
        return this.teardownExecutionRequests;
    }
  }

  getGasLeftForCurrentPhase(): Gas {
    if (this.currentPhase === TxExecutionPhase.TEARDOWN) {
      return this.gasSettings.teardownGasLimits;
    } else {
      return this.gasSettings.gasLimits.sub(this.gasUsed);
    }
  }

  consumeGas(gas: Gas) {
    if (this.currentPhase === TxExecutionPhase.TEARDOWN) {
      // track teardown gas used separately
      this.teardownGasUsed = this.teardownGasUsed.add(gas);
    } else {
      this.gasUsed = this.gasUsed.add(gas);
    }
  }

  /**
   * Compute the gas used using the actual gas used during teardown instead
   * of the teardown gas limit.
   * Note that this.startGasUsed comes from private and private includes
   * teardown gas limit in its output gasUsed.
   */
  getActualGasUsed(): Gas {
    assert(this.currentPhase === TxExecutionPhase.TEARDOWN, 'Can only compute actual gas used after app logic');
    const requireTeardown = this.teardownCallRequests.length > 0;
    const teardownGasLimits = requireTeardown ? this.gasSettings.teardownGasLimits : Gas.empty();
    return this.gasUsed.sub(teardownGasLimits).add(this.teardownGasUsed);
  }

  getGasUsedForFee(): Gas {
    return this.gasUsed;
  }

  getTransactionFeeAtCurrentPhase(): Fr {
    if (this.currentPhase === TxExecutionPhase.TEARDOWN) {
      return this.getTransactionFeeUnsafe();
    } else {
      return Fr.zero();
    }
  }

  getTransactionFee(): Fr {
    assert(this.currentPhase === TxExecutionPhase.TEARDOWN, 'Transaction fee is only known during/after teardown');
    return this.getTransactionFeeUnsafe();
  }

  private getTransactionFeeUnsafe(): Fr {
    const txFee = this.gasUsed.computeFee(this.globalVariables.gasFees);
    this.log.debug(`Computed tx fee`, {
      txFee,
      gasUsed: inspect(this.gasUsed),
      gasFees: inspect(this.globalVariables.gasFees),
    });
    return txFee;
  }
}
