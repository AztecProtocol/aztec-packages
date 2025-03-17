import { MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, NULLIFIER_SUBTREE_HEIGHT } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { type DateProvider, Timer, elapsed, executeTimeout } from '@aztec/foundation/timer';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { ContractClassRegisteredEvent } from '@aztec/protocol-contracts/class-registerer';
import { computeFeePayerBalanceLeafSlot, computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { Gas } from '@aztec/stdlib/gas';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import {
  type FailedTx,
  GlobalVariables,
  NestedProcessReturnValues,
  type ProcessedTx,
  Tx,
  TxExecutionPhase,
  type TxValidator,
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

import { PublicContractsDB, PublicTreesDB } from '../public_db_sources.js';
import { PublicTxSimulator } from '../public_tx_simulator/public_tx_simulator.js';
import { PublicProcessorMetrics } from './public_processor_metrics.js';

/**
 * Creates new instances of PublicProcessor given the provided merkle tree db and contract data source.
 */
export class PublicProcessorFactory {
  constructor(
    private contractDataSource: ContractDataSource,
    private dateProvider: DateProvider,
    private telemetryClient: TelemetryClient = getTelemetryClient(),
  ) {}

  /**
   * Creates a new instance of a PublicProcessor.
   * @param historicalHeader - The header of a block previous to the one in which the tx is included.
   * @param globalVariables - The global variables for the block being processed.
   * @param skipFeeEnforcement - Allows disabling balance checks for fee estimations.
   * @returns A new instance of a PublicProcessor.
   */
  public create(
    merkleTree: MerkleTreeWriteOperations,
    globalVariables: GlobalVariables,
    skipFeeEnforcement: boolean,
  ): PublicProcessor {
    const treesDB = new PublicTreesDB(merkleTree);
    const contractsDB = new PublicContractsDB(this.contractDataSource);
    const publicTxSimulator = this.createPublicTxSimulator(
      treesDB,
      contractsDB,
      globalVariables,
      /*doMerkleOperations=*/ true,
      skipFeeEnforcement,
      this.telemetryClient,
    );

    return new PublicProcessor(
      globalVariables,
      treesDB,
      contractsDB,
      publicTxSimulator,
      this.dateProvider,
      this.telemetryClient,
    );
  }

  protected createPublicTxSimulator(
    treesDB: PublicTreesDB,
    contractsDB: PublicContractsDB,
    globalVariables: GlobalVariables,
    doMerkleOperations: boolean,
    skipFeeEnforcement: boolean,
    telemetryClient: TelemetryClient,
  ) {
    return new PublicTxSimulator(
      treesDB,
      contractsDB,
      globalVariables,
      doMerkleOperations,
      skipFeeEnforcement,
      telemetryClient,
    );
  }
}

class PublicProcessorTimeoutError extends Error {
  constructor(message: string = 'Timed out while processing tx') {
    super(message);
    this.name = 'PublicProcessorTimeoutError';
  }
}

/**
 * Converts Txs lifted from the P2P module into ProcessedTx objects by executing
 * any public function calls in them. Txs with private calls only are unaffected.
 */
export class PublicProcessor implements Traceable {
  private metrics: PublicProcessorMetrics;
  constructor(
    protected globalVariables: GlobalVariables,
    protected treesDB: PublicTreesDB,
    protected contractsDB: PublicContractsDB,
    protected publicTxSimulator: PublicTxSimulator,
    private dateProvider: DateProvider,
    telemetryClient: TelemetryClient = getTelemetryClient(),
    private log = createLogger('simulator:public-processor'),
  ) {
    this.metrics = new PublicProcessorMetrics(telemetryClient, 'PublicProcessor');
  }

  get tracer(): Tracer {
    return this.metrics.tracer;
  }

  /**
   * Run each tx through the public circuit and the public kernel circuit if needed.
   * @param txs - Txs to process.
   * @param processedTxHandler - Handler for processed txs in the context of block building or proving.
   * @returns The list of processed txs with their circuit simulation outputs.
   */
  public async process(
    txs: Iterable<Tx> | AsyncIterable<Tx>,
    limits: {
      maxTransactions?: number;
      maxBlockSize?: number;
      maxBlockGas?: Gas;
      deadline?: Date;
    } = {},
    validators: {
      preprocessValidator?: TxValidator<Tx>;
      postprocessValidator?: TxValidator<ProcessedTx>;
      nullifierCache?: { addNullifiers: (nullifiers: Buffer[]) => void };
    } = {},
  ): Promise<[ProcessedTx[], FailedTx[], NestedProcessReturnValues[]]> {
    const { maxTransactions, maxBlockSize, deadline, maxBlockGas } = limits;
    const { preprocessValidator, postprocessValidator, nullifierCache } = validators;
    const result: ProcessedTx[] = [];
    const failed: FailedTx[] = [];
    const timer = new Timer();

    let totalSizeInBytes = 0;
    let returns: NestedProcessReturnValues[] = [];
    let totalPublicGas = new Gas(0, 0);
    let totalBlockGas = new Gas(0, 0);

    for await (const origTx of txs) {
      // Only process up to the max tx limit
      if (maxTransactions !== undefined && result.length >= maxTransactions) {
        this.log.debug(`Stopping tx processing due to reaching the max tx limit.`);
        break;
      }

      // Bail if we've hit the deadline
      if (deadline && this.dateProvider.now() > +deadline) {
        this.log.warn(`Stopping tx processing due to timeout.`);
        break;
      }

      // Skip this tx if it'd exceed max block size
      const txHash = (await origTx.getTxHash()).toString();
      const preTxSizeInBytes = origTx.getEstimatedPrivateTxEffectsSize();
      if (maxBlockSize !== undefined && totalSizeInBytes + preTxSizeInBytes > maxBlockSize) {
        this.log.warn(`Skipping processing of tx ${txHash} sized ${preTxSizeInBytes} bytes due to block size limit`, {
          txHash,
          sizeInBytes: preTxSizeInBytes,
          totalSizeInBytes,
          maxBlockSize,
        });
        continue;
      }

      // Skip this tx if its gas limit would exceed the block gas limit
      const txGasLimit = origTx.data.constants.txContext.gasSettings.gasLimits;
      if (maxBlockGas !== undefined && totalBlockGas.add(txGasLimit).gtAny(maxBlockGas)) {
        this.log.warn(`Skipping processing of tx ${txHash} due to block gas limit`, {
          txHash,
          txGasLimit,
          totalBlockGas,
          maxBlockGas,
        });
        continue;
      }

      // The processor modifies the tx objects in place, so we need to clone them.
      const tx = Tx.clone(origTx);

      // We validate the tx before processing it, to avoid unnecessary work.
      if (preprocessValidator) {
        const result = await preprocessValidator.validateTx(tx);
        const txHash = await tx.getTxHash();
        if (result.result === 'invalid') {
          const reason = result.reason.join(', ');
          this.log.warn(`Rejecting tx ${txHash.toString()} due to pre-process validation fail: ${reason}`);
          failed.push({ tx, error: new Error(`Tx failed preprocess validation: ${reason}`) });
          returns.push(new NestedProcessReturnValues([]));
          continue;
        } else if (result.result === 'skipped') {
          const reason = result.reason.join(', ');
          this.log.warn(`Skipping tx ${txHash.toString()} due to pre-process validation: ${reason}`);
          returns.push(new NestedProcessReturnValues([]));
          continue;
        } else {
          this.log.trace(`Tx ${txHash.toString()} is valid before processing.`);
        }
      }

      // We checkpoint the transaction here, then within the try/catch we
      // 1. Revert the checkpoint if the tx fails or needs to be discarded for any reason
      // 2. Commit the transaction in the finally block. Note that by using the ForkCheckpoint lifecycle only the first commit/revert takes effect
      const checkpoint = await ForkCheckpoint.new(this.treesDB);

      try {
        const [processedTx, returnValues] = await this.processTx(tx, deadline);

        // If the actual size of this tx would exceed block size, skip it
        const txSize = processedTx.txEffect.getDASize();
        if (maxBlockSize !== undefined && totalSizeInBytes + txSize > maxBlockSize) {
          this.log.warn(`Skipping processed tx ${txHash} sized ${txSize} due to max block size.`, {
            txHash,
            sizeInBytes: txSize,
            totalSizeInBytes,
            maxBlockSize,
          });
          // Need to revert the checkpoint here and don't go any further
          await checkpoint.revert();
          continue;
        }

        // Re-validate the transaction
        if (postprocessValidator) {
          // Only accept processed transactions that are not double-spends,
          // public functions emitting nullifiers would pass earlier check but fail here.
          // Note that we're checking all nullifiers generated in the private execution twice,
          // we could store the ones already checked and skip them here as an optimization.
          // TODO(palla/txs): Can we get into this case? AVM validates this. We should be able to remove it.
          const result = await postprocessValidator.validateTx(processedTx);
          if (result.result !== 'valid') {
            const reason = result.reason.join(', ');
            this.log.error(`Rejecting tx ${processedTx.hash} after processing: ${reason}.`);
            failed.push({ tx, error: new Error(`Tx failed post-process validation: ${reason}`) });
            // Need to revert the checkpoint here and don't go any further
            await checkpoint.revert();
            continue;
          } else {
            this.log.trace(`Tx ${txHash.toString()} is valid post processing.`);
          }
        }

        if (!tx.hasPublicCalls()) {
          // If there are no public calls, perform all tree insertions for side effects from private
          // When there are public calls, the PublicTxSimulator & AVM handle tree insertions.
          await this.doTreeInsertionsForPrivateOnlyTx(processedTx);
          // Add any contracts registered/deployed in this private-only tx to the block-level cache
          // (add to tx-level cache and then commit to block-level cache)
          await this.contractsDB.addNewContracts(tx);
          this.contractsDB.commitContractsForTx();
        }

        nullifierCache?.addNullifiers(processedTx.txEffect.nullifiers.map(n => n.toBuffer()));
        result.push(processedTx);
        returns = returns.concat(returnValues);

        totalPublicGas = totalPublicGas.add(processedTx.gasUsed.publicGas);
        totalBlockGas = totalBlockGas.add(processedTx.gasUsed.totalGas);
        totalSizeInBytes += txSize;
      } catch (err: any) {
        // Roll back state to start of TX before proceeding to next TX
        await checkpoint.revert();
        if (err?.name === 'PublicProcessorTimeoutError') {
          this.log.warn(`Stopping tx processing due to timeout.`);
          break;
        }
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        this.log.warn(`Failed to process tx ${txHash.toString()}: ${errorMessage} ${err?.stack}`);

        failed.push({ tx, error: err instanceof Error ? err : new Error(errorMessage) });
        returns.push(new NestedProcessReturnValues([]));
      } finally {
        // Base case is we always commit the checkpoint. Using the ForkCheckpoint means this has no effect if the tx was reverted
        await checkpoint.commit();
        // The tx-level contracts cache should not live on to the next tx
        this.contractsDB.clearContractsForTx();
      }
    }

    const duration = timer.s();
    const rate = duration > 0 ? totalPublicGas.l2Gas / duration : 0;
    this.metrics.recordAllTxs(totalPublicGas, rate);

    this.log.info(`Processed ${result.length} successful txs and ${failed.length} failed txs in ${duration}s`, {
      duration,
      rate,
      totalPublicGas,
      totalBlockGas,
      totalSizeInBytes,
    });

    return [result, failed, returns];
  }

  @trackSpan('PublicProcessor.processTx', async tx => ({ [Attributes.TX_HASH]: (await tx.getTxHash()).toString() }))
  private async processTx(tx: Tx, deadline?: Date): Promise<[ProcessedTx, NestedProcessReturnValues[]]> {
    const [time, [processedTx, returnValues]] = await elapsed(() => this.processTxWithinDeadline(tx, deadline));

    this.log.verbose(
      !tx.hasPublicCalls()
        ? `Processed tx ${processedTx.hash} with no public calls in ${time}ms`
        : `Processed tx ${processedTx.hash} with ${tx.enqueuedPublicFunctionCalls.length} public calls in ${time}ms`,
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

    return [processedTx, returnValues ?? []];
  }

  private async doTreeInsertionsForPrivateOnlyTx(
    processedTx: ProcessedTx,
    txValidator?: TxValidator<ProcessedTx>,
  ): Promise<void> {
    const treeInsertionStart = process.hrtime.bigint();

    // Update the state so that the next tx in the loop has the correct .startState
    // NB: before this change, all .startStates were actually incorrect, but the issue was never caught because we either:
    // a) had only 1 tx with public calls per block, so this loop had len 1
    // b) always had a txHandler with the same db passed to it as this.db, which updated the db in buildBaseRollupHints in this loop
    // To see how this ^ happens, move back to one shared db in test_context and run orchestrator_multi_public_functions.test.ts
    // The below is taken from buildBaseRollupHints:
    await this.treesDB.appendLeaves(
      MerkleTreeId.NOTE_HASH_TREE,
      padArrayEnd(processedTx.txEffect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
    );
    try {
      await this.treesDB.batchInsert(
        MerkleTreeId.NULLIFIER_TREE,
        padArrayEnd(processedTx.txEffect.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX).map(n => n.toBuffer()),
        NULLIFIER_SUBTREE_HEIGHT,
      );
    } catch (error) {
      if (txValidator) {
        // Ideally the validator has already caught this above, but just in case:
        throw new Error(`Transaction ${processedTx.hash} invalid after processing public functions`);
      } else {
        // We have no validator and assume this call should blindly process txs with duplicates being caught later
        this.log.warn(`Detected duplicate nullifier after public processing for: ${processedTx.hash}.`);
      }
    }

    // The only public data write should be for fee payment
    await this.treesDB.sequentialInsert(
      MerkleTreeId.PUBLIC_DATA_TREE,
      processedTx.txEffect.publicDataWrites.map(x => x.toBuffer()),
    );
    const treeInsertionEnd = process.hrtime.bigint();
    this.metrics.recordTreeInsertions(Number(treeInsertionEnd - treeInsertionStart) / 1_000);
  }

  /** Processes the given tx within deadline. Returns timeout if deadline is hit. */
  private async processTxWithinDeadline(
    tx: Tx,
    deadline?: Date,
  ): Promise<[ProcessedTx, NestedProcessReturnValues[] | undefined]> {
    const processFn: () => Promise<[ProcessedTx, NestedProcessReturnValues[] | undefined]> = tx.hasPublicCalls()
      ? () => this.processTxWithPublicCalls(tx)
      : () => this.processPrivateOnlyTx(tx);

    if (!deadline) {
      return await processFn();
    }

    const txHash = await tx.getTxHash();
    const timeout = +deadline - this.dateProvider.now();
    if (timeout <= 0) {
      throw new PublicProcessorTimeoutError();
    }

    this.log.debug(`Processing tx ${txHash.toString()} within ${timeout}ms`, {
      deadline: deadline.toISOString(),
      now: new Date(this.dateProvider.now()).toISOString(),
      txHash,
    });

    return await executeTimeout(
      () => processFn(),
      timeout,
      () => new PublicProcessorTimeoutError(),
    );
  }

  /**
   * Creates the public data write for paying the tx fee.
   * This is used in private only txs, since for txs with public calls
   * the avm handles the fee payment itself.
   */
  private async getFeePaymentPublicDataWrite(txFee: Fr, feePayer: AztecAddress): Promise<PublicDataWrite> {
    const feeJuiceAddress = ProtocolContractAddress.FeeJuice;
    const balanceSlot = await computeFeePayerBalanceStorageSlot(feePayer);
    const leafSlot = await computeFeePayerBalanceLeafSlot(feePayer);

    this.log.debug(`Deducting ${txFee.toBigInt()} balance in Fee Juice for ${feePayer}`);

    const balance = await this.treesDB.storageRead(feeJuiceAddress, balanceSlot);

    if (balance.lt(txFee)) {
      throw new Error(
        `Not enough balance for fee payer to pay for transaction (got ${balance.toBigInt()} needs ${txFee.toBigInt()})`,
      );
    }

    const updatedBalance = balance.sub(txFee);
    await this.treesDB.storageWrite(feeJuiceAddress, balanceSlot, updatedBalance);

    return new PublicDataWrite(leafSlot, updatedBalance);
  }

  @trackSpan('PublicProcessor.processPrivateOnlyTx', async (tx: Tx) => ({
    [Attributes.TX_HASH]: (await tx.getTxHash()).toString(),
  }))
  private async processPrivateOnlyTx(tx: Tx): Promise<[ProcessedTx, undefined]> {
    const gasFees = this.globalVariables.gasFees;
    const transactionFee = tx.data.gasUsed.computeFee(gasFees);

    const feePaymentPublicDataWrite = await this.getFeePaymentPublicDataWrite(transactionFee, tx.data.feePayer);

    const processedTx = await makeProcessedTxFromPrivateOnlyTx(
      tx,
      transactionFee,
      feePaymentPublicDataWrite,
      this.globalVariables,
    );

    const siloedContractClassLogs = await tx.filterContractClassLogs(
      tx.data.getNonEmptyContractClassLogsHashes(),
      true,
    );

    this.metrics.recordClassRegistration(
      ...siloedContractClassLogs
        .filter(log => ContractClassRegisteredEvent.isContractClassRegisteredEvent(log))
        .map(log => ContractClassRegisteredEvent.fromLog(log)),
    );
    return [processedTx, undefined];
  }

  @trackSpan('PublicProcessor.processTxWithPublicCalls', async tx => ({
    [Attributes.TX_HASH]: (await tx.getTxHash()).toString(),
  }))
  private async processTxWithPublicCalls(tx: Tx): Promise<[ProcessedTx, NestedProcessReturnValues[]]> {
    const timer = new Timer();

    const { avmProvingRequest, gasUsed, revertCode, revertReason, processedPhases } =
      await this.publicTxSimulator.simulate(tx);

    if (!avmProvingRequest) {
      this.metrics.recordFailedTx();
      throw new Error('Avm proving result was not generated.');
    }

    processedPhases.forEach(phase => {
      if (phase.reverted) {
        this.metrics.recordRevertedPhase(phase.phase);
      } else {
        this.metrics.recordPhaseDuration(phase.phase, phase.durationMs);
      }
    });

    const siloedContractClassLogs = await tx.filterContractClassLogs(
      tx.data.getNonEmptyContractClassLogsHashes(),
      true,
    );

    this.metrics.recordClassRegistration(
      ...siloedContractClassLogs
        .filter(log => ContractClassRegisteredEvent.isContractClassRegisteredEvent(log))
        .map(log => ContractClassRegisteredEvent.fromLog(log)),
    );

    const phaseCount = processedPhases.length;
    const durationMs = timer.ms();
    this.metrics.recordTx(phaseCount, durationMs, gasUsed.publicGas);

    const processedTx = await makeProcessedTxFromTxWithPublicCalls(
      tx,
      avmProvingRequest,
      gasUsed,
      revertCode,
      revertReason,
    );

    const returnValues = processedPhases.find(({ phase }) => phase === TxExecutionPhase.APP_LOGIC)?.returnValues ?? [];

    return [processedTx, returnValues];
  }
}
