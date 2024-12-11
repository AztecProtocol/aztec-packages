import {
  type FailedTx,
  MerkleTreeId,
  type MerkleTreeWriteOperations,
  NestedProcessReturnValues,
  type ProcessedTx,
  type ProcessedTxHandler,
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
  type GlobalVariables,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  NULLIFIER_SUBTREE_HEIGHT,
  PublicDataWrite,
} from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { ContractClassRegisteredEvent, ProtocolContractAddress } from '@aztec/protocol-contracts';
import { Attributes, type TelemetryClient, type Tracer, trackSpan } from '@aztec/telemetry-client';

import { computeFeePayerBalanceLeafSlot, computeFeePayerBalanceStorageSlot } from './fee_payment.js';
import { WorldStateDB } from './public_db_sources.js';
import { PublicProcessorMetrics } from './public_processor_metrics.js';
import { PublicTxSimulator } from './public_tx_simulator.js';

/**
 * Creates new instances of PublicProcessor given the provided merkle tree db and contract data source.
 */
export class PublicProcessorFactory {
  constructor(private contractDataSource: ContractDataSource, private telemetryClient: TelemetryClient) {}

  /**
   * Creates a new instance of a PublicProcessor.
   * @param historicalHeader - The header of a block previous to the one in which the tx is included.
   * @param globalVariables - The global variables for the block being processed.
   * @returns A new instance of a PublicProcessor.
   */
  public create(
    merkleTree: MerkleTreeWriteOperations,
    maybeHistoricalHeader: BlockHeader | undefined,
    globalVariables: GlobalVariables,
  ): PublicProcessor {
    const historicalHeader = maybeHistoricalHeader ?? merkleTree.getInitialHeader();

    const worldStateDB = new WorldStateDB(merkleTree, this.contractDataSource);
    const publicTxSimulator = new PublicTxSimulator(
      merkleTree,
      worldStateDB,
      this.telemetryClient,
      globalVariables,
      /*doMerkleOperations=*/ true,
    );

    return new PublicProcessor(
      merkleTree,
      globalVariables,
      historicalHeader,
      worldStateDB,
      publicTxSimulator,
      this.telemetryClient,
    );
  }
}

/**
 * Converts Txs lifted from the P2P module into ProcessedTx objects by executing
 * any public function calls in them. Txs with private calls only are unaffected.
 */
export class PublicProcessor {
  private metrics: PublicProcessorMetrics;
  constructor(
    protected db: MerkleTreeWriteOperations,
    protected globalVariables: GlobalVariables,
    protected historicalHeader: BlockHeader,
    protected worldStateDB: WorldStateDB,
    protected publicTxSimulator: PublicTxSimulator,
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
    processedTxHandler?: ProcessedTxHandler,
    txValidator?: TxValidator<ProcessedTx>,
  ): Promise<[ProcessedTx[], FailedTx[], NestedProcessReturnValues[]]> {
    // The processor modifies the tx objects in place, so we need to clone them.
    txs = txs.map(tx => Tx.clone(tx));
    const result: ProcessedTx[] = [];
    const failed: FailedTx[] = [];
    let returns: NestedProcessReturnValues[] = [];

    for (const tx of txs) {
      // only process up to the limit of the block
      if (result.length >= maxTransactions) {
        break;
      }
      try {
        const [processedTx, returnValues] = !tx.hasPublicCalls()
          ? await this.processPrivateOnlyTx(tx)
          : await this.processTxWithPublicCalls(tx);
        this.log.debug(`Processed tx`, {
          txHash: processedTx.hash,
          historicalHeaderHash: processedTx.constants.historicalHeader.hash(),
          blockNumber: processedTx.constants.globalVariables.blockNumber,
          lastArchiveRoot: processedTx.constants.historicalHeader.lastArchive.root,
        });

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
        // if we were given a handler then send the transaction to it for block building or proving
        if (processedTxHandler) {
          await processedTxHandler.addNewTx(processedTx);
        }
        // Update the state so that the next tx in the loop has the correct .startState
        // NB: before this change, all .startStates were actually incorrect, but the issue was never caught because we either:
        // a) had only 1 tx with public calls per block, so this loop had len 1
        // b) always had a txHandler with the same db passed to it as this.db, which updated the db in buildBaseRollupHints in this loop
        // To see how this ^ happens, move back to one shared db in test_context and run orchestrator_multi_public_functions.test.ts
        // The below is taken from buildBaseRollupHints:
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
        result.push(processedTx);
        returns = returns.concat(returnValues ?? []);
      } catch (err: any) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        this.log.warn(`Failed to process tx ${tx.getTxHash()}: ${errorMessage} ${err?.stack}`);

        failed.push({
          tx,
          error: err instanceof Error ? err : new Error(errorMessage),
        });
        returns.push(new NestedProcessReturnValues([]));
      }
    }

    return [result, failed, returns];
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
  private async processPrivateOnlyTx(tx: Tx): Promise<[ProcessedTx]> {
    const gasFees = this.globalVariables.gasFees;
    const transactionFee = tx.data.gasUsed.computeFee(gasFees);

    const feePaymentPublicDataWrite = await this.getFeePaymentPublicDataWrite(transactionFee, tx.data.feePayer);

    const processedTx = makeProcessedTxFromPrivateOnlyTx(
      tx,
      transactionFee,
      feePaymentPublicDataWrite,
      this.globalVariables,
    );
    return [processedTx];
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
    this.metrics.recordTx(phaseCount, durationMs);

    const processedTx = makeProcessedTxFromTxWithPublicCalls(tx, avmProvingRequest, gasUsed, revertCode, revertReason);

    const returnValues = processedPhases.find(({ phase }) => phase === TxExecutionPhase.APP_LOGIC)?.returnValues ?? [];

    return [processedTx, returnValues];
  }
}
