import {
  MAX_ENQUEUED_CALLS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_LOGS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  AvmAccumulatedData,
  AvmAccumulatedDataArrayLengths,
  AvmCircuitPublicInputs,
  PublicDataWrite,
  RevertCode,
  clampGasSettingsForAVM,
} from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { SimulationError } from '@aztec/stdlib/errors';
import { computeEffectiveGasFees, computeTransactionFee } from '@aztec/stdlib/fees';
import { Gas, GasSettings } from '@aztec/stdlib/gas';
import {
  PrivateToAvmAccumulatedData,
  PrivateToAvmAccumulatedDataArrayLengths,
  PrivateToPublicAccumulatedData,
  PublicCallRequest,
  PublicCallRequestArrayLengths,
  countAccumulatedItems,
} from '@aztec/stdlib/kernel';
import { PublicLog } from '@aztec/stdlib/logs';
import { ScopedL2ToL1Message } from '@aztec/stdlib/messaging';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import {
  type GlobalVariables,
  PublicCallRequestWithCalldata,
  TreeSnapshots,
  type Tx,
  TxExecutionPhase,
  type TxHash,
} from '@aztec/stdlib/tx';

import { strict as assert } from 'assert';
import { inspect } from 'util';

import type { PublicContractsDBInterface } from '../db_interfaces.js';
import type { PublicTreesDB } from '../public_db_sources.js';
import { SideEffectTrace } from '../side_effect_trace.js';
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
    private readonly startTreeSnapshots: TreeSnapshots,
    private readonly globalVariables: GlobalVariables,
    private readonly gasSettings: GasSettings,
    private readonly clampedGasSettings: GasSettings,
    private readonly gasUsedByPrivate: Gas,
    private readonly gasAllocatedToPublic: Gas,
    private readonly gasAllocatedToPublicTeardown: Gas,
    private readonly setupCallRequests: PublicCallRequestWithCalldata[],
    private readonly appLogicCallRequests: PublicCallRequestWithCalldata[],
    private readonly teardownCallRequests: PublicCallRequestWithCalldata[],
    public readonly nonRevertibleAccumulatedDataFromPrivate: PrivateToPublicAccumulatedData,
    public readonly revertibleAccumulatedDataFromPrivate: PrivateToPublicAccumulatedData,
    public readonly feePayer: AztecAddress,
    private readonly trace: SideEffectTrace,
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

    const trace = new SideEffectTrace();

    const firstNullifier = nonRevertibleAccumulatedDataFromPrivate.nullifiers[0];

    // Transaction level state manager that will be forked for revertible phases.
    const txStateManager = PublicPersistableStateManager.create(
      treesDB,
      contractsDB,
      trace,
      doMerkleOperations,
      firstNullifier,
      globalVariables.timestamp,
    );

    const gasSettings = tx.data.constants.txContext.gasSettings;
    const gasUsedByPrivate = tx.data.gasUsed;
    // Gas allocated to public is "whatever's left" after private, but with some max applied.
    const clampedGasSettings = clampGasSettingsForAVM(gasSettings, gasUsedByPrivate);
    const gasAllocatedToPublic = clampedGasSettings.gasLimits.sub(gasUsedByPrivate);
    const gasAllocatedToPublicTeardown = clampedGasSettings.teardownGasLimits;

    return new PublicTxContext(
      await tx.getTxHash(),
      new PhaseStateManager(txStateManager),
      await txStateManager.getTreeSnapshots(),
      globalVariables,
      gasSettings,
      clampedGasSettings,
      gasUsedByPrivate,
      gasAllocatedToPublic,
      gasAllocatedToPublicTeardown,
      getCallRequestsWithCalldataByPhase(tx, TxExecutionPhase.SETUP),
      getCallRequestsWithCalldataByPhase(tx, TxExecutionPhase.APP_LOGIC),
      getCallRequestsWithCalldataByPhase(tx, TxExecutionPhase.TEARDOWN),
      tx.data.forPublic!.nonRevertibleAccumulatedData,
      tx.data.forPublic!.revertibleAccumulatedData,
      tx.data.feePayer,
      trace,
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
    this.log.warn(`${TxExecutionPhase[phase]} phase reverted! ${culprit} failed with reason: ${revertReason?.message}`);

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
      const gasLeftForPublicTeardown = this.gasAllocatedToPublicTeardown.sub(this.teardownGasUsed);
      return gasLeftForPublicTeardown;
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

    // We get the side effects from the AVM.
    // The AVM will already have handled the conditional insertion of most private side-effects.
    // (depending on the revert code of each stage). Only l2ToL1Msgs and publicLogs still need to be "merged".
    const {
      publicDataWrites: avmPublicDataWrites,
      noteHashes: avmNoteHashes,
      nullifiers: avmNullifiers,
      l2ToL1Msgs: avmL2ToL1Msgs,
      publicLogs: avmPublicLogs,
    } = this.trace.getSideEffects();

    // Private generates PrivateLogs, and public execution generates PublicLogs.
    // Since these are two different categories, they should not be merged.
    const finalPublicLogs = avmPublicLogs;

    // We squash public data writes.
    // Maps slot to value. Maps in TS are iterable in insertion order, which is exactly what we want for
    // squashing "to the left", where the first occurrence of a slot uses the value of the last write to it,
    // and the rest occurrences are omitted.
    // Note: you can't write public state from private, so we only squash what we got from the AVM.
    const finalPublicDataWrites = (() => {
      const squashedPublicDataWrites: Map<bigint, Fr> = new Map();
      for (const publicDataWrite of avmPublicDataWrites) {
        squashedPublicDataWrites.set(publicDataWrite.leafSlot.toBigInt(), publicDataWrite.newValue);
      }
      return Array.from(squashedPublicDataWrites.entries()).map(
        ([slot, value]) => new PublicDataWrite(new Fr(slot), value),
      );
    })();

    // Count before padding.
    const accumulatedDataArrayLengths = new AvmAccumulatedDataArrayLengths(
      avmNoteHashes.length,
      avmNullifiers.length,
      avmL2ToL1Msgs.length,
      finalPublicLogs.length,
      finalPublicDataWrites.length,
    );

    const accumulatedData = new AvmAccumulatedData(
      /*noteHashes=*/ padArrayEnd(
        avmNoteHashes.map(n => n.value),
        Fr.zero(),
        MAX_NOTE_HASHES_PER_TX,
      ),
      /*nullifiers=*/ padArrayEnd(
        avmNullifiers.map(n => n.value),
        Fr.zero(),
        MAX_NULLIFIERS_PER_TX,
      ),
      /*l2ToL1Msgs=*/ padArrayEnd(avmL2ToL1Msgs, ScopedL2ToL1Message.empty(), MAX_L2_TO_L1_MSGS_PER_TX),
      /*publicLogs=*/ padArrayEnd(finalPublicLogs, PublicLog.empty(), MAX_PUBLIC_LOGS_PER_TX),
      /*publicDataWrites=*/ padArrayEnd(
        finalPublicDataWrites,
        PublicDataWrite.empty(),
        MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
      ),
    );

    // Now we finally have enough information to pad the trees.
    // NOTE(fcarreiro): a bit weird that a method that generates the PIs does this,
    // but we do need the end tree snapshots. We can consider moving things to the caller.
    const numNoteHashesToPad = MAX_NOTE_HASHES_PER_TX - avmNoteHashes.length;
    const numNullifiersToPad = MAX_NULLIFIERS_PER_TX - avmNullifiers.length;
    await stateManager.padTree(MerkleTreeId.NOTE_HASH_TREE, numNoteHashesToPad);
    await stateManager.padTree(MerkleTreeId.NULLIFIER_TREE, numNullifiersToPad);
    const endTreeSnapshots = await stateManager.getTreeSnapshots();

    // This converts the private accumulated data to the avm accumulated data format.
    const convertAccumulatedData = (from: PrivateToPublicAccumulatedData) =>
      new PrivateToAvmAccumulatedData(from.noteHashes, from.nullifiers, from.l2ToL1Msgs);
    const getPreviousAccumulatedDataArrayLengths = (from: PrivateToPublicAccumulatedData) =>
      new PrivateToAvmAccumulatedDataArrayLengths(
        countAccumulatedItems(from.noteHashes),
        countAccumulatedItems(from.nullifiers),
        countAccumulatedItems(from.l2ToL1Msgs),
      );

    return new AvmCircuitPublicInputs(
      this.globalVariables,
      this.startTreeSnapshots,
      /*startGasUsed=*/ this.gasUsedByPrivate,
      this.clampedGasSettings,
      computeEffectiveGasFees(this.globalVariables.gasFees, this.gasSettings),
      this.feePayer,
      /*publicCallRequestArrayLengths=*/ new PublicCallRequestArrayLengths(
        this.setupCallRequests.length,
        this.appLogicCallRequests.length,
        this.teardownCallRequests.length > 0,
      ),
      /*publicSetupCallRequests=*/ padArrayEnd(
        this.setupCallRequests.map(r => r.request),
        PublicCallRequest.empty(),
        MAX_ENQUEUED_CALLS_PER_TX,
      ),
      /*publicAppLogicCallRequests=*/ padArrayEnd(
        this.appLogicCallRequests.map(r => r.request),
        PublicCallRequest.empty(),
        MAX_ENQUEUED_CALLS_PER_TX,
      ),
      /*publicTeardownCallRequests=*/ this.teardownCallRequests.length > 0
        ? this.teardownCallRequests[0].request
        : PublicCallRequest.empty(),
      getPreviousAccumulatedDataArrayLengths(this.nonRevertibleAccumulatedDataFromPrivate),
      getPreviousAccumulatedDataArrayLengths(this.revertibleAccumulatedDataFromPrivate),
      convertAccumulatedData(this.nonRevertibleAccumulatedDataFromPrivate),
      convertAccumulatedData(this.revertibleAccumulatedDataFromPrivate),
      endTreeSnapshots,
      this.getTotalGasUsed(),
      accumulatedDataArrayLengths,
      accumulatedData,
      /*transactionFee=*/ this.getTransactionFeeUnsafe(),
      /*isReverted=*/ !this.revertCode.isOK(),
    );
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
