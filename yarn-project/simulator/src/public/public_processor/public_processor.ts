import {
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_TX_BLOB_DATA_SIZE_IN_FIELDS,
  NULLIFIER_SUBTREE_HEIGHT,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider, Timer, elapsed, execWithSignal } from '@aztec/foundation/timer';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { ContractClassPublishedEvent } from '@aztec/protocol-contracts/class-registry';
import { computeFeePayerBalanceLeafSlot, computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';
import {
  AvmCircuitInputs,
  AvmCircuitPublicInputs,
  AvmExecutionHints,
  type AvmProvingRequest,
  PublicDataWrite,
  PublicSimulatorConfig,
} from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { computeTransactionFee } from '@aztec/stdlib/fees';
import { Gas } from '@aztec/stdlib/gas';
import type {
  MerkleTreeWriteOperations,
  PublicProcessorLimits,
  PublicProcessorValidator,
  SequencerConfig,
} from '@aztec/stdlib/interfaces/server';
import { type DebugLog, type DebugLogStore, NullDebugLogStore } from '@aztec/stdlib/logs';
import { ProvingRequestType } from '@aztec/stdlib/proofs';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import {
  type FailedTx,
  GlobalVariables,
  NestedProcessReturnValues,
  type ProcessedTx,
  StateReference,
  Tx,
  makeProcessedTxFromPrivateOnlyTx,
  makeProcessedTxFromTxWithPublicCalls,
} from '@aztec/stdlib/tx';
import {
  Attributes,
  type TelemetryClient,
  type Traceable,
  type Tracer,
  getTelemetryClient,
  trackSpan,
} from '@aztec/telemetry-client';
import { ForkCheckpoint } from '@aztec/world-state/native';

import { AssertionError } from 'assert';

import { PublicContractsDB, PublicTreesDB } from '../public_db_sources.js';
import {
  type PublicTxSimulatorConfig,
  type PublicTxSimulatorInterface,
  TelemetryCppPublicTxSimulator,
} from '../public_tx_simulator/index.js';
import { GuardedMerkleTreeOperations } from './guarded_merkle_tree.js';
import { PublicProcessorMetrics } from './public_processor_metrics.js';

/**
 * Creates new instances of PublicProcessor given the provided merkle tree db and contract data source.
 */
export class PublicProcessorFactory {
  private log: Logger;
  constructor(
    private contractDataSource: ContractDataSource,
    private dateProvider: DateProvider = new DateProvider(),
    protected telemetryClient: TelemetryClient = getTelemetryClient(),
    bindings?: LoggerBindings,
  ) {
    this.log = createLogger('simulator:public-processor-factory', bindings);
  }

  /**
   * Creates a new instance of a PublicProcessor.
   * @param globalVariables - The global variables for the block being processed.
   * @param contractsDB - Optional pre-populated contracts DB; a fresh one is constructed if omitted.
   * @returns A new instance of a PublicProcessor.
   */
  public create(
    merkleTree: MerkleTreeWriteOperations,
    globalVariables: GlobalVariables,
    config: PublicSimulatorConfig,
    contractsDB: PublicContractsDB = new PublicContractsDB(this.contractDataSource, this.log.getBindings()),
  ): PublicProcessor {
    const guardedFork = new GuardedMerkleTreeOperations(merkleTree);
    const publicTxSimulator = this.createPublicTxSimulator(guardedFork, contractsDB, globalVariables, config);

    return new PublicProcessor(
      globalVariables,
      guardedFork,
      contractsDB,
      publicTxSimulator,
      this.dateProvider,
      this.telemetryClient,
      createLogger('simulator:public-processor', this.log.getBindings()),
    );
  }

  protected createPublicTxSimulator(
    merkleTree: MerkleTreeWriteOperations,
    contractsDB: PublicContractsDB,
    globalVariables: GlobalVariables,
    config?: Partial<PublicTxSimulatorConfig>,
  ): PublicTxSimulatorInterface {
    return new TelemetryCppPublicTxSimulator(
      merkleTree,
      contractsDB,
      globalVariables,
      this.telemetryClient,
      config,
      this.log.getBindings(),
    );
  }
}

class PublicProcessorTimeoutError extends Error {
  constructor(message: string = 'Timed out while processing tx') {
    super(message);
    this.name = 'PublicProcessorTimeoutError';
  }
}

class PublicProcessorAbortError extends Error {
  constructor(message: string = 'Aborted while processing tx') {
    super(message);
    this.name = 'PublicProcessorAbortError';
  }
}

function isPublicProcessorInterruptError(err: any) {
  return err?.name === 'PublicProcessorTimeoutError' || err?.name === 'PublicProcessorAbortError';
}

/**
 * Converts Txs lifted from the P2P module into ProcessedTx objects by executing
 * any public function calls in them. Txs with private calls only are unaffected.
 */
export class PublicProcessor implements Traceable {
  private metrics: PublicProcessorMetrics;
  constructor(
    protected globalVariables: GlobalVariables,
    private guardedMerkleTree: GuardedMerkleTreeOperations,
    protected contractsDB: PublicContractsDB,
    protected publicTxSimulator: PublicTxSimulatorInterface,
    private dateProvider: DateProvider,
    telemetryClient: TelemetryClient = getTelemetryClient(),
    private log: Logger,
    private opts: Pick<SequencerConfig, 'fakeProcessingDelayPerTxMs' | 'fakeThrowAfterProcessingTxCount'> = {},
    private debugLogStore: DebugLogStore = new NullDebugLogStore(),
  ) {
    this.metrics = new PublicProcessorMetrics(telemetryClient, 'PublicProcessor');
  }

  get tracer(): Tracer {
    return this.metrics.tracer;
  }

  /**
   * Run each tx through the public circuit and the public kernel circuit if needed.
   * @param txs - Txs to process.
   * @param limits - Limits for processing the txs.
   * @param validator - Pre-process validator and nullifier cache to use for processing the txs.
   * @returns The list of processed txs with their circuit simulation outputs.
   */
  public async process(
    txs: Iterable<Tx> | AsyncIterable<Tx>,
    limits: PublicProcessorLimits = {},
    validator: PublicProcessorValidator = {},
  ): Promise<[ProcessedTx[], FailedTx[], Tx[], NestedProcessReturnValues[], DebugLog[]]> {
    const { maxTransactions, deadline, maxBlockGas, maxBlobFields, isBuildingProposal, signal } = limits;
    const { preprocessValidator, nullifierCache } = validator;
    const result: ProcessedTx[] = [];
    const usedTxs: Tx[] = [];
    const failed: FailedTx[] = [];
    const debugLogs: DebugLog[] = [];
    const timer = new Timer();

    let totalSizeInBytes = 0;
    let returns: NestedProcessReturnValues[] = [];
    let totalPublicGas = new Gas(0, 0);
    let totalBlockGas = new Gas(0, 0);
    let totalBlobFields = 0;
    let silentlySkippedCount = 0;
    let totalSilentlySkippedDurationMs = 0;

    for await (const tx of txs) {
      // Only process up to the max tx limit
      if (maxTransactions !== undefined && result.length >= maxTransactions) {
        this.log.debug(`Stopping tx processing due to reaching the max tx limit.`);
        break;
      }

      // Bail if we've hit the deadline or have been interrupted.
      if (deadline && this.dateProvider.now() > +deadline) {
        this.log.warn(`Stopping tx processing due to timeout.`);
        break;
      }
      if (signal?.aborted) {
        this.log.warn(`Stopping tx processing due to abort signal.`);
        break;
      }

      const txHash = tx.getTxHash().toString();

      // Skip this tx if its estimated blob fields would exceed the limit.
      // Only done during proposal building: during re-execution we must process the exact txs from the proposal.
      const txBlobFields = tx.getPrivateTxEffectsSizeInFields();
      if (isBuildingProposal && maxBlobFields !== undefined && totalBlobFields + txBlobFields > maxBlobFields) {
        this.log.warn(
          `Skipping tx ${txHash} with ${txBlobFields} fields from private side effects due to blob fields limit`,
          { txHash, txBlobFields, totalBlobFields, maxBlobFields },
        );
        continue;
      }

      // Skip this tx if its gas limit would exceed the block gas limit (either da or l2).
      // Only done during proposal building: during re-execution we must process the exact txs from the proposal.
      const txGasLimit = tx.data.constants.txContext.gasSettings.gasLimits;
      if (isBuildingProposal && maxBlockGas !== undefined && totalBlockGas.add(txGasLimit).gtAny(maxBlockGas)) {
        this.log.warn(`Skipping processing of tx ${txHash} due to block gas limit`, {
          txHash,
          txGasLimit,
          totalBlockGas,
          maxBlockGas,
        });
        continue;
      }

      // We validate the tx before processing it, to avoid unnecessary work.
      if (preprocessValidator) {
        const result = await preprocessValidator.validateTx(tx);
        const txHash = tx.getTxHash();
        if (result.result === 'invalid') {
          const reason = result.reason.join(', ');
          this.log.debug(`Rejecting tx ${txHash.toString()} due to pre-process validation fail: ${reason}`);
          failed.push({ tx, error: new Error(`Tx failed preprocess validation: ${reason}`) });
          returns.push(new NestedProcessReturnValues([]));
          continue;
        } else {
          this.log.trace(`Tx ${txHash.toString()} is valid before processing.`);
        }
      }

      // We checkpoint the transaction here, then within the try/catch we
      // 1. Revert the checkpoint if the tx fails or needs to be discarded for any reason
      // 2. Commit the transaction in the finally block. Note that by using the ForkCheckpoint lifecycle only the first commit/revert takes effect
      // By doing this, every transaction starts on a fresh checkpoint and it's state updates only make it to the fork if this checkpoint is committed.
      // Note: We use the underlying fork here not the guarded one, this ensures that it's not impacted by stopping the guarded version
      const checkpoint = await ForkCheckpoint.new(this.guardedMerkleTree.getUnderlyingFork());
      const startStateReference = await this.guardedMerkleTree.getUnderlyingFork().getStateReference();
      this.contractsDB.createCheckpoint();

      try {
        const [txProcessingTimeMs, [processedTx, returnValues, txDebugLogs]] = await elapsed(() =>
          this.processTx(tx, deadline, signal),
        );

        // Inject a fake processing failure after N txs if requested
        const fakeThrowAfter = this.opts.fakeThrowAfterProcessingTxCount;
        if (fakeThrowAfter !== undefined && result.length + failed.length + 1 >= fakeThrowAfter) {
          throw new Error(`Fake error after processing ${fakeThrowAfter} txs`);
        }

        const txBlobFields = processedTx.txEffect.getNumBlobFields();
        const txSize = txBlobFields * Fr.SIZE_IN_BYTES;

        // A single tx's effects must fit within the per-tx blob encoding: the rollup circuit encodes each
        // tx into a fixed [Field; MAX_TX_BLOB_DATA_SIZE_IN_FIELDS] array, so a larger tx effect cannot be
        // proven. The per-category side-effect limits already guarantee this upstream, so reaching here means
        // the tx is malformed; reject it as invalid rather than letting it poison proving.
        if (txBlobFields > MAX_TX_BLOB_DATA_SIZE_IN_FIELDS) {
          const error = new Error(
            `Tx ${txHash} produced ${txBlobFields} blob fields, exceeding the per-tx maximum of ${MAX_TX_BLOB_DATA_SIZE_IN_FIELDS}`,
          );
          this.log.error(error.message, { txHash, txBlobFields });
          await checkpoint.revert();
          this.contractsDB.revertCheckpoint();
          failed.push({ tx, error });
          returns.push(new NestedProcessReturnValues([]));
          continue;
        }

        // If the actual blob fields of this tx would exceed the limit, skip it.
        // Note: maxBlobFields already accounts for block end blob fields and previous blocks in checkpoint.
        if (maxBlobFields !== undefined && totalBlobFields + txBlobFields > maxBlobFields) {
          this.log.debug(
            `Skipping processed tx ${txHash} with ${txBlobFields} blob fields due to max blob fields limit.`,
            {
              txHash,
              txBlobFields,
              totalBlobFields,
              maxBlobFields,
              txProcessingTimeMs,
            },
          );
          silentlySkippedCount += 1;
          totalSilentlySkippedDurationMs += txProcessingTimeMs;
          this.metrics.recordSilentlySkipped(txProcessingTimeMs);
          // Need to revert the checkpoint here and don't go any further
          await checkpoint.revert();
          this.contractsDB.revertCheckpoint();
          continue;
        }

        // During re-execution, check if the actual gas used by this tx would push the block over the gas limit.
        // Unlike the proposal-building check (which uses declared gas limits pessimistically before processing),
        // this uses actual gas and stops processing when the limit is exceeded.
        if (
          !isBuildingProposal &&
          maxBlockGas !== undefined &&
          totalBlockGas.add(processedTx.gasUsed.totalGas).gtAny(maxBlockGas)
        ) {
          this.log.warn(`Stopping re-execution since tx ${txHash} would push block gas over limit`, {
            txHash,
            txGas: processedTx.gasUsed.totalGas,
            totalBlockGas,
            maxBlockGas,
          });
          await checkpoint.revert();
          this.contractsDB.revertCheckpoint();
          break;
        }

        // FIXME(fcarreiro): it's ugly to have to notify the validator of nullifiers.
        // I'd rather pass the validators the processedTx as well and let them deal with it.
        nullifierCache?.addNullifiers(processedTx.txEffect.nullifiers.map(n => n.toBuffer()));
        result.push(processedTx);
        usedTxs.push(tx);
        returns = returns.concat(returnValues);
        debugLogs.push(...txDebugLogs);

        this.debugLogStore.storeLogs(processedTx.hash.toString(), txDebugLogs);

        totalPublicGas = totalPublicGas.add(processedTx.gasUsed.publicGas);
        totalBlockGas = totalBlockGas.add(processedTx.gasUsed.totalGas);
        totalSizeInBytes += txSize;
        totalBlobFields += txBlobFields;

        // Commit the tx-level contracts checkpoint on success
        this.contractsDB.commitCheckpoint();
      } catch (err: any) {
        if (isPublicProcessorInterruptError(err)) {
          const interruptReason = err.name === 'PublicProcessorTimeoutError' ? 'timeout' : 'abort signal';
          this.log.warn(`Stopping tx processing due to ${interruptReason}.`);
          // The tx may still be executing on a worker thread (C++ via NAPI).
          // Signal cancellation AND WAIT for the simulation to actually stop before touching fork checkpoints.
          await this.publicTxSimulator.cancel?.();

          // Now stop the guarded fork to prevent any further TS-side access to the world state.
          await this.guardedMerkleTree.stop();

          // We now know there can't be any further access to world state. The fork is in a state where there is:
          // 1. At least one outstanding checkpoint that has not been committed (the one created before we processed the tx).
          // 2. Possible state updates on that checkpoint or any others created during execution.

          // Revert all checkpoints at or above this checkpoint's depth (inclusive), destroying any outstanding state
          // updates from this tx and any nested checkpoints created during execution. This preserves any checkpoints
          // created by callers below our depth.
          await checkpoint.revertToCheckpoint();

          // Revert any contracts added to the DB for the tx.
          this.contractsDB.revertCheckpoint();

          // Ensure we're at the same state as when we started processing this tx.
          await this.checkWorldStateUnchanged(startStateReference, txHash, err);

          // We should now be in a position where the fork is in a clean state and no further updates can be made to it.
          break;
        }

        // Roll back state to start of TX before proceeding to next TX.
        // Reverts all checkpoints at or above this checkpoint's depth, preserving any caller checkpoints below.
        await checkpoint.revertToCheckpoint();
        this.contractsDB.revertCheckpoint();
        const errorMessage = err instanceof Error || err instanceof AssertionError ? err.message : 'Unknown error';
        this.log.warn(`Failed to process tx ${txHash.toString()}: ${errorMessage} ${err?.stack}`);
        failed.push({ tx, error: err instanceof Error ? err : new Error(errorMessage) });
        returns.push(new NestedProcessReturnValues([]));

        // Ensure we're at the same state as when we started processing this tx.
        await this.checkWorldStateUnchanged(startStateReference, txHash, err);
      } finally {
        // Base case is we always commit the checkpoint. Using the ForkCheckpoint means this has no effect if the tx was previously reverted
        await checkpoint.commit();
      }
    }

    const duration = timer.s();
    const rate = duration > 0 ? totalPublicGas.l2Gas / duration : 0;
    this.metrics.recordAllTxs(totalPublicGas, rate);

    const silentlySkippedDurationMs = Math.round(totalSilentlySkippedDurationMs);
    this.log.info(
      `Processed ${result.length} successful txs and ${failed.length} failed txs ` +
        `(${silentlySkippedCount} silently skipped, ${silentlySkippedDurationMs}ms wasted) ` +
        `in ${duration}s`,
      {
        blockNumber: this.globalVariables.blockNumber,
        successfulCount: result.length,
        failedCount: failed.length,
        duration,
        rate,
        totalPublicGas,
        totalBlockGas,
        totalSizeInBytes,
        silentlySkippedCount,
        silentlySkippedDurationMs,
      },
    );

    return [result, failed, usedTxs, returns, debugLogs];
  }

  private async checkWorldStateUnchanged(
    startStateReference: StateReference,
    txHash: `0x${string}`,
    cause: Error,
  ): Promise<void> {
    const endStateReference = await this.guardedMerkleTree.getUnderlyingFork().getStateReference();
    if (!startStateReference.equals(endStateReference)) {
      this.log.warn(`Fork state reference changed by tx ${txHash} after error in public processor`, {
        expected: startStateReference.toInspect(),
        actual: endStateReference.toInspect(),
        cause,
      });
      throw new Error(`Fork state reference changed by tx ${txHash} after error in public processor`, { cause });
    }
  }

  @trackSpan('PublicProcessor.processTx', tx => ({ [Attributes.TX_HASH]: tx.getTxHash().toString() }))
  private async processTx(
    tx: Tx,
    deadline: Date | undefined,
    signal: AbortSignal | undefined,
  ): Promise<[ProcessedTx, NestedProcessReturnValues[], DebugLog[]]> {
    const [time, [processedTx, returnValues, debugLogs]] = await elapsed(() =>
      this.processTxWithinDeadline(tx, deadline, signal),
    );

    this.log.verbose(
      !tx.hasPublicCalls()
        ? `Processed tx ${processedTx.hash} with no public calls in ${time}ms`
        : `Processed tx ${processedTx.hash} with ${tx.numberOfPublicCalls()} public calls in ${time}ms`,
      {
        txHash: processedTx.hash,
        txFee: processedTx.txEffect.transactionFee.toBigInt(),
        revertCode: processedTx.txEffect.revertCode.getCode(),
        revertReason: processedTx.revertReason,
        gasUsed: processedTx.gasUsed,
        publicDataWriteCount: processedTx.txEffect.publicDataWrites.length,
        nullifierCount: processedTx.txEffect.nullifiers.length,
        noteHashCount: processedTx.txEffect.noteHashes.length,
        contractClassLogCount: processedTx.txEffect.contractClassLogs.length,
        publicLogCount: processedTx.txEffect.publicLogs.length,
        privateLogCount: processedTx.txEffect.privateLogs.length,
        l2ToL1MessageCount: processedTx.txEffect.l2ToL1Msgs.length,
        durationMs: time,
      },
    );

    return [processedTx, returnValues ?? [], debugLogs];
  }

  private async doTreeInsertionsForPrivateOnlyTx(processedTx: ProcessedTx): Promise<void> {
    const treeInsertionStart = process.hrtime.bigint();

    // Update the state so that the next tx in the loop has the correct .startState
    // NB: before this change, all .startStates were actually incorrect, but the issue was never caught because we either:
    // a) had only 1 tx with public calls per block, so this loop had len 1
    // b) always had a txHandler with the same db passed to it as this.db, which updated the db in buildBaseRollupHints in this loop
    // To see how this ^ happens, move back to one shared db in test_context and run orchestrator_multi_public_functions.test.ts
    // The below is taken from buildBaseRollupHints:
    await this.guardedMerkleTree.appendLeaves(
      MerkleTreeId.NOTE_HASH_TREE,
      padArrayEnd(processedTx.txEffect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
    );
    try {
      await this.guardedMerkleTree.batchInsert(
        MerkleTreeId.NULLIFIER_TREE,
        padArrayEnd(processedTx.txEffect.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX).map(n => n.toBuffer()),
        NULLIFIER_SUBTREE_HEIGHT,
      );
    } catch (cause) {
      throw new Error(`Transaction ${processedTx.hash} failed with duplicate nullifiers`, { cause });
    }

    const treeInsertionEnd = process.hrtime.bigint();
    this.metrics.recordTreeInsertions(Number(treeInsertionEnd - treeInsertionStart) / 1_000);
  }

  /** Processes the given tx within deadline or until the signal is aborted. */
  private async processTxWithinDeadline(
    tx: Tx,
    deadline: Date | undefined,
    signal: AbortSignal | undefined,
  ): Promise<[ProcessedTx, NestedProcessReturnValues[] | undefined, DebugLog[]]> {
    const innerProcessFn: () => Promise<[ProcessedTx, NestedProcessReturnValues[] | undefined, DebugLog[]]> =
      tx.hasPublicCalls() ? () => this.processTxWithPublicCalls(tx) : () => this.processPrivateOnlyTx(tx);

    // Fake a delay per tx if instructed (used for tests)
    const fakeDelayPerTxMs = this.opts.fakeProcessingDelayPerTxMs;
    const processFn =
      fakeDelayPerTxMs && fakeDelayPerTxMs > 0
        ? async () => {
            const result = await innerProcessFn();
            this.log.warn(`Sleeping ${fakeDelayPerTxMs}ms after processing tx ${tx.getTxHash().toString()}`);
            await sleep(fakeDelayPerTxMs);
            return result;
          }
        : innerProcessFn;

    const processingSignal = this.getProcessingSignal(tx, deadline, signal);
    if (!processingSignal) {
      return await processFn();
    }

    return await execWithSignal(
      () => processFn(),
      processingSignal,
      signal =>
        signal.reason?.name === 'TimeoutError' ? new PublicProcessorTimeoutError() : new PublicProcessorAbortError(),
    );
  }

  private getProcessingSignal(tx: Tx, deadline: Date | undefined, signal: AbortSignal | undefined) {
    if (!deadline) {
      return signal;
    }

    const timeout = +deadline - this.dateProvider.now();
    if (timeout <= 0) {
      throw new PublicProcessorTimeoutError();
    }

    const txHash = tx.getTxHash();
    this.log.debug(`Processing tx ${txHash.toString()} within ${timeout}ms`, {
      deadline: deadline.toISOString(),
      now: new Date(this.dateProvider.now()).toISOString(),
      txHash,
    });

    const timeoutSignal = AbortSignal.timeout(timeout);
    return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  }

  /**
   * Creates the public data write for paying the tx fee.
   * This is used in private only txs, since for txs with public calls
   * the avm handles the fee payment itself.
   */
  private async performFeePaymentPublicDataWrite(txFee: Fr, feePayer: AztecAddress): Promise<PublicDataWrite> {
    const feeJuiceAddress = ProtocolContractAddress.FeeJuice;
    const balanceSlot = await computeFeePayerBalanceStorageSlot(feePayer);
    const leafSlot = await computeFeePayerBalanceLeafSlot(feePayer);
    // This high-level db is used as a convenient helper. It could be done with the merkleTree directly.
    const treesDB = new PublicTreesDB(this.guardedMerkleTree);

    this.log.debug(`Deducting ${txFee.toBigInt()} balance in Fee Juice for ${feePayer}`);

    const balance = await treesDB.storageRead(feeJuiceAddress, balanceSlot);

    if (balance.lt(txFee)) {
      throw new Error(
        `Not enough balance for fee payer to pay for transaction (got ${balance.toBigInt()} needs ${txFee.toBigInt()})`,
      );
    }

    const updatedBalance = balance.sub(txFee);
    await treesDB.storageWrite(feeJuiceAddress, balanceSlot, updatedBalance);

    return new PublicDataWrite(leafSlot, updatedBalance);
  }

  @trackSpan('PublicProcessor.processPrivateOnlyTx', (tx: Tx) => ({
    [Attributes.TX_HASH]: tx.getTxHash().toString(),
  }))
  private async processPrivateOnlyTx(tx: Tx): Promise<[ProcessedTx, undefined, DebugLog[]]> {
    const gasFees = this.globalVariables.gasFees;
    const transactionFee = computeTransactionFee(gasFees, tx.data.constants.txContext.gasSettings, tx.data.gasUsed);

    const feePaymentPublicDataWrite = await this.performFeePaymentPublicDataWrite(transactionFee, tx.data.feePayer);

    const processedTx = makeProcessedTxFromPrivateOnlyTx(
      tx,
      transactionFee,
      feePaymentPublicDataWrite,
      this.globalVariables,
    );

    this.metrics.recordClassPublication(
      ...tx
        .getContractClassLogs()
        .filter(log => ContractClassPublishedEvent.isContractClassPublishedEvent(log))
        .map(log => ContractClassPublishedEvent.fromLog(log)),
    );

    // Fee payment insertion has already been done. Do the rest.
    await this.doTreeInsertionsForPrivateOnlyTx(processedTx);

    this.contractsDB.addNewContracts(tx);

    return [processedTx, undefined, []];
  }

  @trackSpan('PublicProcessor.processTxWithPublicCalls', tx => ({
    [Attributes.TX_HASH]: tx.getTxHash().toString(),
  }))
  private async processTxWithPublicCalls(tx: Tx): Promise<[ProcessedTx, NestedProcessReturnValues[], DebugLog[]]> {
    const timer = new Timer();

    const result = await this.publicTxSimulator.simulate(tx);
    // TODO: use the callStackMetadata here to extract more data about public execution
    const { hints, publicInputs, publicTxEffect, gasUsed, revertCode /*callStackMetadata*/ } = result;

    const contractClassLogs = revertCode.isOK()
      ? tx.getContractClassLogs()
      : tx.getSplitContractClassLogs(false /* revertible */);
    this.metrics.recordClassPublication(
      ...contractClassLogs
        .filter(log => ContractClassPublishedEvent.isContractClassPublishedEvent(log))
        .map(log => ContractClassPublishedEvent.fromLog(log)),
    );

    // TODO(fcarreiro): remove phase count metric.
    const durationMs = timer.ms();
    this.metrics.recordTx(/*phaseCount=*/ 1, durationMs, gasUsed.publicGas);

    // Extract the return values from the call stack metadata.
    const appLogicReturnValues: NestedProcessReturnValues[] = result.getAppLogicReturnValues();
    // Extract the revert reason from the call stack metadata.
    const revertReason = result.findRevertReason();
    // Create proving request if we have hints and public inputs.
    const avmProvingRequest =
      hints && publicInputs ? PublicProcessor.generateProvingRequest(publicInputs, hints) : undefined;

    const processedTx = makeProcessedTxFromTxWithPublicCalls(
      tx,
      this.globalVariables,
      avmProvingRequest,
      publicTxEffect,
      gasUsed,
      revertCode,
      revertReason,
    );

    return [processedTx, appLogicReturnValues, result.logs ?? []];
  }

  /**
   * Generate the proving request for the AVM circuit.
   */
  private static generateProvingRequest(
    publicInputs: AvmCircuitPublicInputs,
    hints: AvmExecutionHints = AvmExecutionHints.empty(),
  ): AvmProvingRequest {
    return {
      type: ProvingRequestType.PUBLIC_VM,
      inputs: new AvmCircuitInputs(hints, publicInputs),
    };
  }
}
