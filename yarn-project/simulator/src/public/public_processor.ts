import {
  type FailedTx,
  type MerkleTreeWriteOperations,
  NestedProcessReturnValues,
  type ProcessedTx,
  type ProcessedTxHandler,
  Tx,
  type TxValidator,
  makeProcessedTx,
  validateProcessedTx,
} from '@aztec/circuit-types';
import {
  ContractClassRegisteredEvent,
  type ContractDataSource,
  type GlobalVariables,
  type Header,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PublicDataUpdateRequest,
} from '@aztec/circuits.js';
import { times } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { Attributes, type TelemetryClient, type Tracer, trackSpan } from '@aztec/telemetry-client';

import { type SimulationProvider } from '../providers/index.js';
import { EnqueuedCallsProcessor } from './enqueued_calls_processor.js';
import { PublicExecutor } from './executor.js';
import { computeFeePayerBalanceLeafSlot, computeFeePayerBalanceStorageSlot } from './fee_payment.js';
import { WorldStateDB } from './public_db_sources.js';
import { RealPublicKernelCircuitSimulator } from './public_kernel.js';
import { type PublicKernelCircuitSimulator } from './public_kernel_circuit_simulator.js';
import { PublicProcessorMetrics } from './public_processor_metrics.js';

/**
 * Creates new instances of PublicProcessor given the provided merkle tree db and contract data source.
 */
export class PublicProcessorFactory {
  constructor(
    private contractDataSource: ContractDataSource,
    private simulator: SimulationProvider,
    private telemetryClient: TelemetryClient,
  ) {}

  /**
   * Creates a new instance of a PublicProcessor.
   * @param historicalHeader - The header of a block previous to the one in which the tx is included.
   * @param globalVariables - The global variables for the block being processed.
   * @returns A new instance of a PublicProcessor.
   */
  public create(
    merkleTree: MerkleTreeWriteOperations,
    maybeHistoricalHeader: Header | undefined,
    globalVariables: GlobalVariables,
  ): PublicProcessor {
    const { telemetryClient } = this;
    const historicalHeader = maybeHistoricalHeader ?? merkleTree.getInitialHeader();

    const worldStateDB = new WorldStateDB(merkleTree, this.contractDataSource);
    const publicExecutor = new PublicExecutor(worldStateDB, telemetryClient);
    const publicKernelSimulator = new RealPublicKernelCircuitSimulator(this.simulator);

    return PublicProcessor.create(
      merkleTree,
      publicExecutor,
      publicKernelSimulator,
      globalVariables,
      historicalHeader,
      worldStateDB,
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
    protected publicExecutor: PublicExecutor,
    protected publicKernel: PublicKernelCircuitSimulator,
    protected globalVariables: GlobalVariables,
    protected historicalHeader: Header,
    protected worldStateDB: WorldStateDB,
    protected enqueuedCallsProcessor: EnqueuedCallsProcessor,
    telemetryClient: TelemetryClient,
    private log = createDebugLogger('aztec:sequencer:public-processor'),
  ) {
    this.metrics = new PublicProcessorMetrics(telemetryClient, 'PublicProcessor');
  }

  static create(
    db: MerkleTreeWriteOperations,
    publicExecutor: PublicExecutor,
    publicKernelSimulator: PublicKernelCircuitSimulator,
    globalVariables: GlobalVariables,
    historicalHeader: Header,
    worldStateDB: WorldStateDB,
    telemetryClient: TelemetryClient,
  ) {
    const enqueuedCallsProcessor = EnqueuedCallsProcessor.create(
      db,
      publicExecutor,
      publicKernelSimulator,
      globalVariables,
      historicalHeader,
      worldStateDB,
    );

    return new PublicProcessor(
      db,
      publicExecutor,
      publicKernelSimulator,
      globalVariables,
      historicalHeader,
      worldStateDB,
      enqueuedCallsProcessor,
      telemetryClient,
    );
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
          ? [makeProcessedTx(tx, tx.data.toKernelCircuitPublicInputs())]
          : await this.processTxWithPublicCalls(tx);
        this.log.debug(`Processed tx`, {
          txHash: processedTx.hash,
          historicalHeaderHash: processedTx.data.constants.historicalHeader.hash(),
          blockNumber: processedTx.data.constants.globalVariables.blockNumber,
          lastArchiveRoot: processedTx.data.constants.historicalHeader.lastArchive.root,
        });

        // Set fee payment update request into the processed tx
        processedTx.finalPublicDataUpdateRequests = await this.createFinalDataUpdateRequests(processedTx);

        // Commit the state updates from this transaction
        await this.worldStateDB.commit();
        validateProcessedTx(processedTx);

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
   * Creates the final set of data update requests for the transaction. This includes the
   * set of public data update requests as returned by the public kernel, plus a data update
   * request for updating fee balance. It also updates the local public state db.
   * See build_or_patch_payment_update_request in base_rollup_inputs.nr for more details.
   */
  private async createFinalDataUpdateRequests(tx: ProcessedTx) {
    const finalPublicDataUpdateRequests = [
      ...tx.data.end.publicDataUpdateRequests,
      ...times(PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, () => PublicDataUpdateRequest.empty()),
    ];

    const feePayer = tx.data.feePayer;
    if (feePayer.isZero()) {
      return finalPublicDataUpdateRequests;
    }

    const feeJuiceAddress = ProtocolContractAddress.FeeJuice;
    const balanceSlot = computeFeePayerBalanceStorageSlot(feePayer);
    const leafSlot = computeFeePayerBalanceLeafSlot(feePayer);
    const txFee = tx.data.getTransactionFee(this.globalVariables.gasFees);

    this.log.debug(`Deducting ${txFee} balance in Fee Juice for ${feePayer}`);

    const existingBalanceWriteIndex = finalPublicDataUpdateRequests.findIndex(request =>
      request.leafSlot.equals(leafSlot),
    );

    const balance =
      existingBalanceWriteIndex > -1
        ? finalPublicDataUpdateRequests[existingBalanceWriteIndex].newValue
        : await this.worldStateDB.storageRead(feeJuiceAddress, balanceSlot);

    if (balance.lt(txFee)) {
      throw new Error(`Not enough balance for fee payer to pay for transaction (got ${balance} needs ${txFee})`);
    }

    const updatedBalance = balance.sub(txFee);
    await this.worldStateDB.storageWrite(feeJuiceAddress, balanceSlot, updatedBalance);

    finalPublicDataUpdateRequests[
      existingBalanceWriteIndex > -1 ? existingBalanceWriteIndex : MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
    ] = new PublicDataUpdateRequest(leafSlot, updatedBalance, 0);

    return finalPublicDataUpdateRequests;
  }

  @trackSpan('PublicProcessor.processTxWithPublicCalls', tx => ({
    [Attributes.TX_HASH]: tx.getTxHash().toString(),
  }))
  private async processTxWithPublicCalls(tx: Tx): Promise<[ProcessedTx, NestedProcessReturnValues[]]> {
    const timer = new Timer();

    const { avmProvingRequest, tailKernelOutput, returnValues, revertReason, gasUsed, processedPhases } =
      await this.enqueuedCallsProcessor.process(tx);

    if (!tailKernelOutput) {
      this.metrics.recordFailedTx();
      throw new Error('Final public kernel was not executed.');
    }

    processedPhases.forEach(phase => {
      if (phase.revertReason) {
        this.metrics.recordRevertedPhase(phase.phase);
      } else {
        this.metrics.recordPhaseDuration(phase.phase, phase.durationMs);
      }
    });

    this.metrics.recordClassRegistration(
      ...ContractClassRegisteredEvent.fromLogs(
        tx.unencryptedLogs.unrollLogs(),
        ProtocolContractAddress.ContractClassRegisterer,
      ),
    );

    const phaseCount = processedPhases.length;
    this.metrics.recordTx(phaseCount, timer.ms());

    const processedTx = makeProcessedTx(tx, tailKernelOutput, { avmProvingRequest, revertReason, gasUsed });
    return [processedTx, returnValues];
  }
}
