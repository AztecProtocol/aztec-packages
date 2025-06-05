import { MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, NULLIFIER_SUBTREE_HEIGHT } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider, Timer, elapsed, executeTimeout } from '@aztec/foundation/timer';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { ContractClassRegisteredEvent } from '@aztec/protocol-contracts/class-registerer';
import { computeFeePayerBalanceLeafSlot, computeFeePayerBalanceStorageSlot } from '@aztec/protocol-contracts/fee-juice';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { Gas } from '@aztec/stdlib/gas';
import type {
  MerkleTreeWriteOperations,
  PublicProcessorLimits,
  PublicProcessorValidator,
} from '@aztec/stdlib/interfaces/server';
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
import { type PublicTxSimulator, TelemetryPublicTxSimulator } from '../public_tx_simulator/index.js';
import { GuardedMerkleTreeOperations } from './guarded_merkle_tree.js';
import { PublicProcessorMetrics } from './public_processor_metrics.js';

/**
 * Creates new instances of PublicProcessor given the provided merkle tree db and contract data source.
 */
export class PublicProcessorFactory {
  constructor(
    private contractDataSource: ContractDataSource,
    private dateProvider: DateProvider = new DateProvider(),
    protected telemetryClient: TelemetryClient = getTelemetryClient(),
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
    clientInitiatedSimulation: boolean = false,
  ): PublicProcessor {
    const contractsDB = new PublicContractsDB(this.contractDataSource);

    const guardedFork = new GuardedMerkleTreeOperations(merkleTree);
    const publicTxSimulator = this.createPublicTxSimulator(
      guardedFork,
      contractsDB,
      globalVariables,
      /*doMerkleOperations=*/ true,
      skipFeeEnforcement,
      clientInitiatedSimulation,
    );

    return new PublicProcessor(
      globalVariables,
      guardedFork,
      contractsDB,
      publicTxSimulator,
      this.dateProvider,
      this.telemetryClient,
    );
  }

  protected createPublicTxSimulator(
    merkleTree: MerkleTreeWriteOperations,
    contractsDB: PublicContractsDB,
    globalVariables: GlobalVariables,
    doMerkleOperations: boolean,
    skipFeeEnforcement: boolean,
    clientInitiatedSimulation: boolean,
  ): PublicTxSimulator {
    return new TelemetryPublicTxSimulator(
      merkleTree,
      contractsDB,
      globalVariables,
      doMerkleOperations,
      skipFeeEnforcement,
      clientInitiatedSimulation,
      this.telemetryClient,
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
    private guardedMerkleTree: GuardedMerkleTreeOperations,
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
   * @param limits - Limits for processing the txs.
   * @param validator - Pre-process validator and nullifier cache to use for processing the txs.
   * @returns The list of processed txs with their circuit simulation outputs.
   */
  public async process(
    txs: Iterable<Tx> | AsyncIterable<Tx>,
    limits: PublicProcessorLimits = {},
    validator: PublicProcessorValidator = {},
  ): Promise<[ProcessedTx[], FailedTx[], Tx[], NestedProcessReturnValues[]]> {
    const { maxTransactions, maxBlockSize, deadline, maxBlockGas } = limits;
    const { preprocessValidator, nullifierCache } = validator;
    const result: ProcessedTx[] = [];
    const usedTxs: Tx[] = [];
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
      // By doing this, every transaction starts on a fresh checkpoint and it's state updates only make it to the fork if this checkpoint is committed.
      // Note: We use the underlying fork here not the guarded one, this ensures that it's not impacted by stopping the guarded version
      const checkpoint = await ForkCheckpoint.new(this.guardedMerkleTree.getUnderlyingFork());

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

        // FIXME(fcarreiro): it's ugly to have to notify the validator of nullifiers.
        // I'd rather pass the validators the processedTx as well and let them deal with it.
        nullifierCache?.addNullifiers(processedTx.txEffect.nullifiers.map(n => n.toBuffer()));
        result.push(processedTx);
        usedTxs.push(tx);
        returns = returns.concat(returnValues);

        totalPublicGas = totalPublicGas.add(processedTx.gasUsed.publicGas);
        totalBlockGas = totalBlockGas.add(processedTx.gasUsed.totalGas);
        totalSizeInBytes += txSize;
      } catch (err: any) {
        if (err?.name === 'PublicProcessorTimeoutError') {
          this.log.warn(`Stopping tx processing due to timeout.`);
          // We hit the transaction execution deadline.
          // There may still be a transaction executing. We stop the guarded fork to prevent any further access to the world state.
          await this.guardedMerkleTree.stop();

          // We now know there can't be any further access to world state. The fork is in a state where there is:
          // 1. At least one outstanding checkpoint that has not been committed (the one created before we processed the tx).
          // 2. Possible state updates on that checkpoint or any others created during execution.

          // First we revert a checkpoint as managed by the ForkCheckpoint. This will revert whatever is the current checkpoint
          // which may not be the one originally created by this object. But that is ok, we do this to fulfil the ForkCheckpoint
          // lifecycle expectations and ensure it doesn't attempt to commit later on.
          await checkpoint.revert();

          // Now we want to revert any/all remaining checkpoints, destroying any outstanding state updates.
          // This needs to be done directly on the underlying fork as the guarded fork has been stopped.
          await this.guardedMerkleTree.getUnderlyingFork().revertAllCheckpoints();

          // We should now be in a position where the fork is in a clean state and no further updates can be made to it.
          break;
        }

        // Roll back state to start of TX before proceeding to next TX
        await checkpoint.revert();
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        this.log.warn(`Failed to process tx ${txHash.toString()}: ${errorMessage} ${err?.stack}`);
        failed.push({ tx, error: err instanceof Error ? err : new Error(errorMessage) });
        returns.push(new NestedProcessReturnValues([]));
      } finally {
        // Base case is we always commit the checkpoint. Using the ForkCheckpoint means this has no effect if the tx was previously reverted
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

    return [result, failed, usedTxs, returns];
  }

  @trackSpan('PublicProcessor.processTx', async tx => ({ [Attributes.TX_HASH]: (await tx.getTxHash()).toString() }))
  private async processTx(tx: Tx, deadline?: Date): Promise<[ProcessedTx, NestedProcessReturnValues[]]> {
    const [time, [processedTx, returnValues]] = await elapsed(() => this.processTxWithinDeadline(tx, deadline));

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
    } catch {
      if (txValidator) {
        // Ideally the validator has already caught this above, but just in case:
        throw new Error(`Transaction ${processedTx.hash} invalid after processing public functions`);
      } else {
        // We have no validator and assume this call should blindly process txs with duplicates being caught later
        this.log.warn(`Detected duplicate nullifier after public processing for: ${processedTx.hash}.`);
      }
    }

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

  @trackSpan('PublicProcessor.processPrivateOnlyTx', async (tx: Tx) => ({
    [Attributes.TX_HASH]: (await tx.getTxHash()).toString(),
  }))
  private async processPrivateOnlyTx(tx: Tx): Promise<[ProcessedTx, undefined]> {
    const gasFees = this.globalVariables.gasFees;
    const transactionFee = tx.data.gasUsed.computeFee(gasFees);

    const feePaymentPublicDataWrite = await this.performFeePaymentPublicDataWrite(transactionFee, tx.data.feePayer);

    const processedTx = await makeProcessedTxFromPrivateOnlyTx(
      tx,
      transactionFee,
      feePaymentPublicDataWrite,
      this.globalVariables,
    );

    this.metrics.recordClassRegistration(
      ...tx
        .getContractClassLogs()
        .filter(log => ContractClassRegisteredEvent.isContractClassRegisteredEvent(log))
        .map(log => ContractClassRegisteredEvent.fromLog(log)),
    );

    // Fee payment insertion has already been done. Do the rest.
    await this.doTreeInsertionsForPrivateOnlyTx(processedTx);

    // Add any contracts registered/deployed in this private-only tx to the block-level cache
    // (add to tx-level cache and then commit to block-level cache)
    await this.contractsDB.addNewContracts(tx);
    this.contractsDB.commitContractsForTx();

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
        this.metrics.recordPhaseDuration(phase.phase, phase.durationMs ?? 0);
      }
    });

    const contractClassLogs = revertCode.isOK()
      ? tx.getContractClassLogs()
      : tx.getSplitContractClassLogs(false /* revertible */);
    this.metrics.recordClassRegistration(
      ...contractClassLogs
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
