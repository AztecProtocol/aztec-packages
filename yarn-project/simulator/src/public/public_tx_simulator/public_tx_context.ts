import {
  MAX_L2_GAS_PER_TX_PUBLIC_PORTION,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { assertLength } from '@aztec/foundation/serialize';
import {
  type AvmCircuitPublicInputs,
  AvmExecutionHints,
  AvmTxHint,
  PublicDataWrite,
  RevertCode,
} from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { SimulationError } from '@aztec/stdlib/errors';
import { computeTransactionFee } from '@aztec/stdlib/fees';
import { Gas, GasSettings } from '@aztec/stdlib/gas';
import {
  PrivateToAvmAccumulatedData,
  PrivateToAvmAccumulatedDataArrayLengths,
  type PrivateToPublicAccumulatedData,
  PublicCallRequest,
  countAccumulatedItems,
  mergeAccumulatedData,
} from '@aztec/stdlib/kernel';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import {
  type GlobalVariables,
  PublicCallRequestWithCalldata,
  type StateReference,
  TreeSnapshots,
  type Tx,
  TxExecutionPhase,
  type TxHash,
} from '@aztec/stdlib/tx';

import { strict as assert } from 'assert';
import { inspect } from 'util';

import type { PublicContractsDBInterface } from '../../server.js';
import { HintingPublicContractsDB, HintingPublicTreesDB } from '../hinting_db_sources.js';
import type { PublicTreesDB } from '../public_db_sources.js';
import { SideEffectArrayLengths, SideEffectTrace } from '../side_effect_trace.js';
import { PublicPersistableStateManager } from '../state_manager/state_manager.js';
import { getCallRequestsWithCalldataByPhase } from '../utils.js';

/**
 * The transaction-level context for public execution.
 */
export class PublicTxContext {
  private log: Logger;

  /* Gas used including private, teardown gas _limit_, setup and app logic */
  private gasUsedByPublic: Gas = Gas.empty();
  /* Gas actually used during teardown (different from limit) */
  public teardownGasUsed: Gas = Gas.empty();

  /* Entire transaction execution is done. */
  private halted = false;
  /* Where did reverts happen (if at all)? */
  private revertCode: RevertCode = RevertCode.OK;
  /* What caused a revert (if one occurred)? */
  public revertReason: SimulationError | undefined;

  private constructor(
    public readonly txHash: TxHash,
    public readonly state: PhaseStateManager,
    private readonly globalVariables: GlobalVariables,
    private readonly startStateReference: StateReference,
    private readonly gasSettings: GasSettings,
    private readonly gasUsedByPrivate: Gas,
    private readonly gasAllocatedToPublic: Gas,
    private readonly setupCallRequests: PublicCallRequestWithCalldata[],
    private readonly appLogicCallRequests: PublicCallRequestWithCalldata[],
    private readonly teardownCallRequests: PublicCallRequestWithCalldata[],
    public readonly nonRevertibleAccumulatedDataFromPrivate: PrivateToPublicAccumulatedData,
    public readonly revertibleAccumulatedDataFromPrivate: PrivateToPublicAccumulatedData,
    public readonly feePayer: AztecAddress,
    private readonly trace: SideEffectTrace,
    public readonly hints: AvmExecutionHints, // This is public due to enqueued call hinting.
  ) {
    this.log = createLogger(`simulator:public_tx_context`);
  }

  public static async create(
    treesDB: PublicTreesDB,
    contractsDB: PublicContractsDBInterface,
    tx: Tx,
    globalVariables: GlobalVariables,
    doMerkleOperations: boolean,
  ) {
    const nonRevertibleAccumulatedDataFromPrivate = tx.data.forPublic!.nonRevertibleAccumulatedData;

    const previousAccumulatedDataArrayLengths = new SideEffectArrayLengths(
      /*publicDataWrites*/ 0,
      /*protocolPublicDataWrites*/ 0,
      /*noteHashes*/ 0,
      /*nullifiers=*/ 0,
      countAccumulatedItems(nonRevertibleAccumulatedDataFromPrivate.l2ToL1Msgs),
      /*publicLogs*/ 0,
    );

    const trace = new SideEffectTrace(/*startSideEffectCounter=*/ 0, previousAccumulatedDataArrayLengths);

    const firstNullifier = nonRevertibleAccumulatedDataFromPrivate.nullifiers[0];

    // We wrap the DB to collect AVM hints.
    const hints = new AvmExecutionHints(await AvmTxHint.fromTx(tx));
    const hintingContractsDB = new HintingPublicContractsDB(contractsDB, hints);
    const hintingTreesDB = new HintingPublicTreesDB(treesDB, hints);

    // Transaction level state manager that will be forked for revertible phases.
    const txStateManager = PublicPersistableStateManager.create(
      hintingTreesDB,
      hintingContractsDB,
      trace,
      doMerkleOperations,
      firstNullifier,
      globalVariables.blockNumber.toNumber(),
    );

    const gasSettings = tx.data.constants.txContext.gasSettings;
    const gasUsedByPrivate = tx.data.gasUsed;
    // Gas allocated to public is "whatever's left" after private, but with some max applied.
    const gasAllocatedToPublic = applyMaxToAvailableGas(gasSettings.gasLimits.sub(gasUsedByPrivate));

    return new PublicTxContext(
      await tx.getTxHash(),
      new PhaseStateManager(txStateManager),
      globalVariables,
      await treesDB.getStateReference(),
      gasSettings,
      gasUsedByPrivate,
      gasAllocatedToPublic,
      getCallRequestsWithCalldataByPhase(tx, TxExecutionPhase.SETUP),
      getCallRequestsWithCalldataByPhase(tx, TxExecutionPhase.APP_LOGIC),
      getCallRequestsWithCalldataByPhase(tx, TxExecutionPhase.TEARDOWN),
      tx.data.forPublic!.nonRevertibleAccumulatedData,
      tx.data.forPublic!.revertibleAccumulatedData,
      tx.data.feePayer,
      trace,
      hints,
    );
  }

  /**
   * Signal that the entire transaction execution is done.
   * All phases have been processed.
   * Actual transaction fee and actual total consumed gas can now be queried.
   */
  async halt() {
    if (this.state.isForked()) {
      await this.state.mergeForkedState();
    }
    this.halted = true;
  }

  /**
   * Revert execution a phase. Populate revertReason & revertCode.
   * If in setup, throw an error (transaction will be thrown out).
   * NOTE: this does not "halt" the entire transaction execution.
   */
  revert(phase: TxExecutionPhase, revertReason: SimulationError | undefined = undefined, culprit = '') {
    this.log.warn(`${TxExecutionPhase[phase]} phase reverted! ${culprit} failed with reason: ${revertReason}`);

    if (revertReason && !this.revertReason) {
      // don't override revertReason
      // (if app logic and teardown both revert, we want app logic's reason)
      this.revertReason = revertReason;
    }
    if (phase === TxExecutionPhase.SETUP) {
      this.log.warn(`Setup phase reverted! The transaction will be thrown out.`);
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
  getCallRequestsForPhase(phase: TxExecutionPhase): PublicCallRequestWithCalldata[] {
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
   * How much gas is left as of the specified phase?
   */
  getGasLeftAtPhase(phase: TxExecutionPhase): Gas {
    if (phase === TxExecutionPhase.TEARDOWN) {
      return applyMaxToAvailableGas(this.gasSettings.teardownGasLimits);
    } else {
      const gasLeftForPublic = this.gasAllocatedToPublic.sub(this.gasUsedByPublic);
      return gasLeftForPublic;
    }
  }

  /**
   * Consume gas. Track gas for teardown phase separately.
   */
  consumeGas(phase: TxExecutionPhase, gas: Gas) {
    if (phase === TxExecutionPhase.TEARDOWN) {
      this.teardownGasUsed = this.teardownGasUsed.add(gas);
    } else {
      this.gasUsedByPublic = this.gasUsedByPublic.add(gas);
    }
  }

  /**
   * The gasUsed by public and private,
   * as if the entire teardown gas limit was consumed.
   */
  getTotalGasUsed(): Gas {
    return this.gasUsedByPrivate.add(this.gasUsedByPublic);
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
    return this.getTotalGasUsed().sub(teardownGasLimits).add(this.teardownGasUsed);
  }

  /**
   * Compute the public gas used using the actual gas used during teardown instead
   * of the teardown gas limit.
   */
  getActualPublicGasUsed(): Gas {
    assert(this.halted, 'Can only compute actual gas used after tx execution ends');
    return this.gasUsedByPublic.add(this.teardownGasUsed);
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
    const gasUsed = this.getTotalGasUsed();
    const txFee = computeTransactionFee(this.globalVariables.gasFees, this.gasSettings, gasUsed);

    this.log.debug(`Computed tx fee`, {
      txFee,
      gasUsed: inspect(gasUsed),
      gasFees: inspect(this.globalVariables.gasFees),
    });

    return txFee;
  }

  /**
   * Generate the public inputs for the AVM circuit.
   */
  public async generateAvmCircuitPublicInputs(): Promise<AvmCircuitPublicInputs> {
    assert(this.halted, 'Can only get AvmCircuitPublicInputs after tx execution ends');
    const stateManager = this.state.getActiveStateManager();

    const startTreeSnapshots = new TreeSnapshots(
      this.startStateReference.l1ToL2MessageTree,
      this.startStateReference.partial.noteHashTree,
      this.startStateReference.partial.nullifierTree,
      this.startStateReference.partial.publicDataTree,
    );

    // FIXME: We are first creating the PIs with the wrong endTreeSnapshots, then patching them.
    // This is because we need to know the lengths of the accumulated data arrays to pad them.
    // We should refactor this to avoid this hack.
    // We should just get the info we need from the trace, and create the rest of the PIs here.
    const avmCircuitPublicInputs = this.trace.toAvmCircuitPublicInputs(
      this.globalVariables,
      startTreeSnapshots,
      /*startGasUsed=*/ this.gasUsedByPrivate,
      this.gasSettings,
      this.feePayer,
      this.setupCallRequests.map(r => r.request),
      this.appLogicCallRequests.map(r => r.request),
      /*teardownCallRequest=*/ this.teardownCallRequests.length
        ? this.teardownCallRequests[0].request
        : PublicCallRequest.empty(),
      /*endTreeSnapshots=*/ TreeSnapshots.empty(), // Will be patched/padded at the end of this fn
      /*endGasUsed=*/ this.getTotalGasUsed(),
      /*transactionFee=*/ this.getTransactionFeeUnsafe(),
      /*reverted=*/ !this.revertCode.isOK(),
    );

    const getArrayLengths = (from: PrivateToPublicAccumulatedData) =>
      new PrivateToAvmAccumulatedDataArrayLengths(
        countAccumulatedItems(from.noteHashes),
        countAccumulatedItems(from.nullifiers),
        countAccumulatedItems(from.l2ToL1Msgs),
      );
    const convertAccumulatedData = (from: PrivateToPublicAccumulatedData) =>
      new PrivateToAvmAccumulatedData(from.noteHashes, from.nullifiers, from.l2ToL1Msgs);
    // Temporary overrides as these entries aren't yet populated in trace
    avmCircuitPublicInputs.previousNonRevertibleAccumulatedDataArrayLengths = getArrayLengths(
      this.nonRevertibleAccumulatedDataFromPrivate,
    );
    avmCircuitPublicInputs.previousRevertibleAccumulatedDataArrayLengths = getArrayLengths(
      this.revertibleAccumulatedDataFromPrivate,
    );
    avmCircuitPublicInputs.previousNonRevertibleAccumulatedData = convertAccumulatedData(
      this.nonRevertibleAccumulatedDataFromPrivate,
    );
    avmCircuitPublicInputs.previousRevertibleAccumulatedData = convertAccumulatedData(
      this.revertibleAccumulatedDataFromPrivate,
    );

    const msgsFromPrivate = this.revertCode.isOK()
      ? mergeAccumulatedData(
          avmCircuitPublicInputs.previousNonRevertibleAccumulatedData.l2ToL1Msgs,
          avmCircuitPublicInputs.previousRevertibleAccumulatedData.l2ToL1Msgs,
        )
      : avmCircuitPublicInputs.previousNonRevertibleAccumulatedData.l2ToL1Msgs;
    avmCircuitPublicInputs.accumulatedData.l2ToL1Msgs = assertLength(
      mergeAccumulatedData(msgsFromPrivate, avmCircuitPublicInputs.accumulatedData.l2ToL1Msgs),
      MAX_L2_TO_L1_MSGS_PER_TX,
    );

    // Maps slot to value. Maps in TS are iterable in insertion order, which is exactly what we want for
    // squashing "to the left", where the first occurrence of a slot uses the value of the last write to it,
    // and the rest occurrences are omitted
    const squashedPublicDataWrites: Map<bigint, Fr> = new Map();
    for (const publicDataWrite of avmCircuitPublicInputs.accumulatedData.publicDataWrites) {
      squashedPublicDataWrites.set(publicDataWrite.leafSlot.toBigInt(), publicDataWrite.value);
    }

    avmCircuitPublicInputs.accumulatedData.publicDataWrites = padArrayEnd(
      Array.from(squashedPublicDataWrites.entries()).map(([slot, value]) => new PublicDataWrite(new Fr(slot), value)),
      PublicDataWrite.empty(),
      MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    );
    const numNoteHashesToPad =
      MAX_NOTE_HASHES_PER_TX - countAccumulatedItems(avmCircuitPublicInputs.accumulatedData.noteHashes);
    await stateManager.deprecatedGetTreesForPIGeneration().padTree(MerkleTreeId.NOTE_HASH_TREE, numNoteHashesToPad);
    const numNullifiersToPad =
      MAX_NULLIFIERS_PER_TX - countAccumulatedItems(avmCircuitPublicInputs.accumulatedData.nullifiers);
    await stateManager.deprecatedGetTreesForPIGeneration().padTree(MerkleTreeId.NULLIFIER_TREE, numNullifiersToPad);

    const paddedState = await stateManager.deprecatedGetTreesForPIGeneration().getStateReference();
    avmCircuitPublicInputs.endTreeSnapshots = new TreeSnapshots(
      paddedState.l1ToL2MessageTree,
      paddedState.partial.noteHashTree,
      paddedState.partial.nullifierTree,
      paddedState.partial.publicDataTree,
    );

    return avmCircuitPublicInputs;
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
  private log: Logger;

  private currentlyActiveStateManager: PublicPersistableStateManager | undefined;

  constructor(private readonly txStateManager: PublicPersistableStateManager) {
    this.log = createLogger(`simulator:public_phase_state_manager`);
  }

  async fork() {
    assert(!this.currentlyActiveStateManager, 'Cannot fork when already forked');
    this.log.debug(`Forking phase state manager`);
    this.currentlyActiveStateManager = await this.txStateManager.fork();
  }

  getActiveStateManager() {
    return this.currentlyActiveStateManager || this.txStateManager;
  }

  isForked() {
    return !!this.currentlyActiveStateManager;
  }

  async mergeForkedState() {
    assert(this.currentlyActiveStateManager, 'No forked state to merge');
    this.log.debug(`Merging in forked state`);
    await this.txStateManager.merge(this.currentlyActiveStateManager!);
    // Drop the forked state manager now that it is merged
    this.currentlyActiveStateManager = undefined;
  }

  async discardForkedState() {
    this.log.debug(`Discarding forked state`);
    assert(this.currentlyActiveStateManager, 'No forked state to discard');
    await this.txStateManager.reject(this.currentlyActiveStateManager!);
    // Drop the forked state manager. We don't want it!
    this.currentlyActiveStateManager = undefined;
  }
}

/**
 * Apply L2 gas maximum.
 */
function applyMaxToAvailableGas(availableGas: Gas) {
  return new Gas(
    /*daGas=*/ availableGas.daGas,
    /*l2Gas=*/ Math.min(availableGas.l2Gas, MAX_L2_GAS_PER_TX_PUBLIC_PORTION),
  );
}
