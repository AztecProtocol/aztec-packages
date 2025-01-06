import {
  type FailedTx,
  MerkleTreeId,
  type MerkleTreeWriteOperations,
  NestedProcessReturnValues,
  type ProcessedTx,
  Tx,
  TxExecutionPhase,
  type TxValidator,
  makeProcessedTxFromPrivateOnlyTx,
  makeProcessedTxFromTxWithPublicCalls,
} from '@aztec/circuit-types';
import {
  type AztecAddress,
  type BlockHeader,
  type ContractDataSource,
  Fr,
  Gas,
  type GlobalVariables,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  NULLIFIER_SUBTREE_HEIGHT,
  PublicDataWrite,
} from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { type DateProvider, Timer, elapsed, executeTimeout } from '@aztec/foundation/timer';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { ContractClassRegisteredEvent } from '@aztec/protocol-contracts/class-registerer';
import { Attributes, type TelemetryClient, type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';

import { computeFeePayerBalanceLeafSlot, computeFeePayerBalanceStorageSlot } from './fee_payment.js';
import { WorldStateDB } from './public_db_sources.js';
import { PublicProcessorMetrics } from './public_processor_metrics.js';
import { PublicTxSimulator } from './public_tx_simulator.js';

/**
 * Creates new instances of PublicProcessor given the provided merkle tree db and contract data source.
 */
export class PublicProcessorFactory {
  constructor(
    private contractDataSource: ContractDataSource,
    private dateProvider: DateProvider,
    private telemetryClient: TelemetryClient,
  ) {}

  /**
   * Creates a new instance of a PublicProcessor.
   * @param historicalHeader - The header of a block previous to the one in which the tx is included.
   * @param globalVariables - The global variables for the block being processed.
   * @param enforceFeePayment - Allows disabling balance checks for fee estimations.
   * @returns A new instance of a PublicProcessor.
   */
  public create(
    merkleTree: MerkleTreeWriteOperations,
    maybeHistoricalHeader: BlockHeader | undefined,
    globalVariables: GlobalVariables,
    enforceFeePayment: boolean,
  ): PublicProcessor {
    const historicalHeader = maybeHistoricalHeader ?? merkleTree.getInitialHeader();

    const worldStateDB = new WorldStateDB(merkleTree, this.contractDataSource);
    const publicTxSimulator = this.createPublicTxSimulator(
      merkleTree,
      worldStateDB,
      this.telemetryClient,
      globalVariables,
      /*doMerkleOperations=*/ true,
      enforceFeePayment,
    );

    return new PublicProcessor(
      merkleTree,
      globalVariables,
      historicalHeader,
      worldStateDB,
      publicTxSimulator,
      this.dateProvider,
      this.telemetryClient,
    );
  }

  protected createPublicTxSimulator(
    db: MerkleTreeWriteOperations,
    worldStateDB: WorldStateDB,
    telemetryClient: TelemetryClient,
    globalVariables: GlobalVariables,
    doMerkleOperations: boolean,
    enforceFeePayment: boolean,
  ) {
    return new PublicTxSimulator(
      db,
      worldStateDB,
      telemetryClient,
      globalVariables,
      doMerkleOperations,
      enforceFeePayment,
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
    protected db: MerkleTreeWriteOperations,
    protected globalVariables: GlobalVariables,
    protected historicalHeader: BlockHeader,
    protected worldStateDB: WorldStateDB,
    protected publicTxSimulator: PublicTxSimulator,
    private dateProvider: DateProvider,
    telemetryClient: TelemetryClient,
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
    txs: Tx[],
    maxTransactions = txs.length,
    txValidator?: TxValidator<ProcessedTx>,
    deadline?: Date,
  ): Promise<[ProcessedTx[], FailedTx[], NestedProcessReturnValues[]]> {
    // The processor modifies the tx objects in place, so we need to clone them.
    txs = txs.map(tx => Tx.clone(tx));
    const result: ProcessedTx[] = [];
    const failed: FailedTx[] = [];
    let returns: NestedProcessReturnValues[] = [];
    let totalGas = new Gas(0, 0);
    const timer = new Timer();

    for (const tx of txs) {
      // only process up to the limit of the block
      if (result.length >= maxTransactions) {
        break;
      }
      try {
        const [processedTx, returnValues] = await this.processTx(tx, txValidator, deadline);
        result.push(processedTx);
        returns = returns.concat(returnValues);
        totalGas = totalGas.add(processedTx.gasUsed.publicGas);
      } catch (err: any) {
        if (err?.name === 'PublicProcessorTimeoutError') {
          this.log.warn(`Stopping tx processing due to timeout.`);
          break;
        }
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        this.log.warn(`Failed to process tx ${tx.getTxHash()}: ${errorMessage} ${err?.stack}`);

        failed.push({ tx, error: err instanceof Error ? err : new Error(errorMessage) });
        returns.push(new NestedProcessReturnValues([]));
      }
    }

    const duration = timer.s();
    const rate = duration > 0 ? totalGas.l2Gas / duration : 0;
    this.metrics.recordAllTxs(totalGas, rate);

    return [result, failed, returns];
  }

  @trackSpan('PublicProcessor.processTx', tx => ({ [Attributes.TX_HASH]: tx.tryGetTxHash()?.toString() }))
  private async processTx(
    tx: Tx,
    txValidator?: TxValidator<ProcessedTx>,
    deadline?: Date,
  ): Promise<[ProcessedTx, NestedProcessReturnValues[]]> {
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
        contractClassLogCount: processedTx.txEffect.contractClassLogs.getTotalLogCount(),
        unencryptedLogCount: processedTx.txEffect.unencryptedLogs.getTotalLogCount(),
        privateLogCount: processedTx.txEffect.privateLogs.length,
        l2ToL1MessageCount: processedTx.txEffect.l2ToL1Msgs.length,
        durationMs: time,
      },
    );

    // Commit the state updates from this transaction
    await this.worldStateDB.commit();

    // Re-validate the transaction
    if (txValidator) {
      // Only accept processed transactions that are not double-spends,
      // public functions emitting nullifiers would pass earlier check but fail here.
      // Note that we're checking all nullifiers generated in the private execution twice,
      // we could store the ones already checked and skip them here as an optimization.
      const [_, invalid] = await txValidator.validateTxs([processedTx]);
      if (invalid.length) {
        throw new Error(`Transaction ${invalid[0].hash} invalid after processing public functions`);
      }
    }
    // Update the state so that the next tx in the loop has the correct .startState
    // NB: before this change, all .startStates were actually incorrect, but the issue was never caught because we either:
    // a) had only 1 tx with public calls per block, so this loop had len 1
    // b) always had a txHandler with the same db passed to it as this.db, which updated the db in buildBaseRollupHints in this loop
    // To see how this ^ happens, move back to one shared db in test_context and run orchestrator_multi_public_functions.test.ts
    // The below is taken from buildBaseRollupHints:
    const treeInsertionStart = process.hrtime.bigint();
    await this.db.appendLeaves(
      MerkleTreeId.NOTE_HASH_TREE,
      padArrayEnd(processedTx.txEffect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
    );
    try {
      await this.db.batchInsert(
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

    await this.db.sequentialInsert(
      MerkleTreeId.PUBLIC_DATA_TREE,
      processedTx.txEffect.publicDataWrites.map(x => x.toBuffer()),
    );
    const treeInsertionEnd = process.hrtime.bigint();
    this.metrics.recordTreeInsertions(Number(treeInsertionEnd - treeInsertionStart) / 1_000);

    return [processedTx, returnValues ?? []];
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

    const timeout = +deadline - this.dateProvider.now();
    this.log.debug(`Processing tx ${tx.getTxHash().toString()} within ${timeout}ms`, {
      deadline: deadline.toISOString(),
      now: new Date(this.dateProvider.now()).toISOString(),
      txHash: tx.getTxHash().toString(),
    });

    if (timeout < 0) {
      throw new PublicProcessorTimeoutError();
    }

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
  private async getFeePaymentPublicDataWrite(txFee: Fr, feePayer: AztecAddress): Promise<PublicDataWrite | undefined> {
    if (feePayer.isZero()) {
      this.log.debug(`No one is paying the fee of ${txFee.toBigInt()}`);
      return;
    }

    const feeJuiceAddress = ProtocolContractAddress.FeeJuice;
    const balanceSlot = computeFeePayerBalanceStorageSlot(feePayer);
    const leafSlot = computeFeePayerBalanceLeafSlot(feePayer);

    this.log.debug(`Deducting ${txFee.toBigInt()} balance in Fee Juice for ${feePayer}`);

    const balance = await this.worldStateDB.storageRead(feeJuiceAddress, balanceSlot);

    if (balance.lt(txFee)) {
      throw new Error(
        `Not enough balance for fee payer to pay for transaction (got ${balance.toBigInt()} needs ${txFee.toBigInt()})`,
      );
    }

    const updatedBalance = balance.sub(txFee);
    await this.worldStateDB.storageWrite(feeJuiceAddress, balanceSlot, updatedBalance);

    return new PublicDataWrite(leafSlot, updatedBalance);
  }

  @trackSpan('PublicProcessor.processPrivateOnlyTx', (tx: Tx) => ({
    [Attributes.TX_HASH]: tx.getTxHash().toString(),
  }))
  private async processPrivateOnlyTx(tx: Tx): Promise<[ProcessedTx, undefined]> {
    const gasFees = this.globalVariables.gasFees;
    const transactionFee = tx.data.gasUsed.computeFee(gasFees);

    const feePaymentPublicDataWrite = await this.getFeePaymentPublicDataWrite(transactionFee, tx.data.feePayer);

    const processedTx = makeProcessedTxFromPrivateOnlyTx(
      tx,
      transactionFee,
      feePaymentPublicDataWrite,
      this.globalVariables,
    );

    this.metrics.recordClassRegistration(
      ...tx.contractClassLogs
        .unrollLogs()
        .filter(log => ContractClassRegisteredEvent.isContractClassRegisteredEvent(log.data))
        .map(log => ContractClassRegisteredEvent.fromLog(log.data)),
    );
    return [processedTx, undefined];
  }

  @trackSpan('PublicProcessor.processTxWithPublicCalls', tx => ({
    [Attributes.TX_HASH]: tx.getTxHash().toString(),
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
      if (phase.revertReason) {
        this.metrics.recordRevertedPhase(phase.phase);
      } else {
        this.metrics.recordPhaseDuration(phase.phase, phase.durationMs);
      }
    });

    this.metrics.recordClassRegistration(
      ...tx.contractClassLogs
        .unrollLogs()
        .filter(log => ContractClassRegisteredEvent.isContractClassRegisteredEvent(log.data))
        .map(log => ContractClassRegisteredEvent.fromLog(log.data)),
    );

    const phaseCount = processedPhases.length;
    const durationMs = timer.ms();
    this.metrics.recordTx(phaseCount, durationMs, gasUsed.publicGas);

    const processedTx = makeProcessedTxFromTxWithPublicCalls(tx, avmProvingRequest, gasUsed, revertCode, revertReason);

    const returnValues = processedPhases.find(({ phase }) => phase === TxExecutionPhase.APP_LOGIC)?.returnValues ?? [];

    return [processedTx, returnValues];
  }
}
