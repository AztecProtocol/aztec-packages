import {
  type FailedTx,
  NestedProcessReturnValues,
  type ProcessedTx,
  type ProcessedTxHandler,
  PublicKernelType,
  type PublicProvingRequest,
  type SimulationError,
  Tx,
  type TxValidator,
  makeProcessedTx,
  validateProcessedTx,
} from '@aztec/circuit-types';
import {
  AztecAddress,
  ContractClassRegisteredEvent,
  FEE_JUICE_ADDRESS,
  type GlobalVariables,
  type Header,
  type KernelCircuitPublicInputs,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PublicDataUpdateRequest,
} from '@aztec/circuits.js';
import { times } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { type ProtocolArtifact } from '@aztec/noir-protocol-circuits-types';
import { ClassRegistererAddress } from '@aztec/protocol-contracts/class-registerer';
import {
  PublicExecutor,
  type PublicStateDB,
  type SimulationProvider,
  computeFeePayerBalanceLeafSlot,
  computeFeePayerBalanceStorageSlot,
} from '@aztec/simulator';
import { Attributes, type TelemetryClient, type Tracer, trackSpan } from '@aztec/telemetry-client';
import { type ContractDataSource } from '@aztec/types/contracts';
import { type MerkleTreeOperations } from '@aztec/world-state';

import { type AbstractPhaseManager } from './abstract_phase_manager.js';
import { PhaseManagerFactory } from './phase_manager_factory.js';
import { ContractsDataSourcePublicDB, WorldStateDB, WorldStatePublicDB } from './public_db_sources.js';
import { RealPublicKernelCircuitSimulator } from './public_kernel.js';
import { type PublicKernelCircuitSimulator } from './public_kernel_circuit_simulator.js';
import { PublicProcessorMetrics } from './public_processor_metrics.js';

/**
 * Creates new instances of PublicProcessor given the provided merkle tree db and contract data source.
 */
export class PublicProcessorFactory {
  constructor(
    private merkleTree: MerkleTreeOperations,
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
  public create(maybeHistoricalHeader: Header | undefined, globalVariables: GlobalVariables): PublicProcessor {
    const { merkleTree, telemetryClient } = this;
    const historicalHeader = maybeHistoricalHeader ?? merkleTree.getInitialHeader();
    const publicContractsDB = new ContractsDataSourcePublicDB(this.contractDataSource);

    const worldStatePublicDB = new WorldStatePublicDB(merkleTree);
    const worldStateDB = new WorldStateDB(merkleTree);
    const publicExecutor = new PublicExecutor(
      worldStatePublicDB,
      publicContractsDB,
      worldStateDB,
      historicalHeader,
      telemetryClient,
    );
    return new PublicProcessor(
      merkleTree,
      publicExecutor,
      new RealPublicKernelCircuitSimulator(this.simulator),
      globalVariables,
      historicalHeader,
      publicContractsDB,
      worldStatePublicDB,
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
    protected db: MerkleTreeOperations,
    protected publicExecutor: PublicExecutor,
    protected publicKernel: PublicKernelCircuitSimulator,
    protected globalVariables: GlobalVariables,
    protected historicalHeader: Header,
    protected publicContractsDB: ContractsDataSourcePublicDB,
    protected publicStateDB: PublicStateDB,
    telemetryClient: TelemetryClient,
    private log = createDebugLogger('aztec:sequencer:public-processor'),
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
          ? [makeProcessedTx(tx, tx.data.toKernelCircuitPublicInputs(), [])]
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
        await this.publicStateDB.commit();
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

    const feeJuiceAddress = AztecAddress.fromBigInt(FEE_JUICE_ADDRESS);
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
        : await this.publicStateDB.storageRead(feeJuiceAddress, balanceSlot);

    if (balance.lt(txFee)) {
      throw new Error(`Not enough balance for fee payer to pay for transaction (got ${balance} needs ${txFee})`);
    }

    const updatedBalance = balance.sub(txFee);
    await this.publicStateDB.storageWrite(feeJuiceAddress, balanceSlot, updatedBalance);

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
    let returnValues: NestedProcessReturnValues[] = [];
    const publicProvingRequests: PublicProvingRequest[] = [];
    let phase: AbstractPhaseManager | undefined = PhaseManagerFactory.phaseFromTx(
      tx,
      this.db,
      this.publicExecutor,
      this.publicKernel,
      this.globalVariables,
      this.historicalHeader,
      this.publicContractsDB,
      this.publicStateDB,
    );
    this.log.debug(`Beginning processing in phase ${phase?.phase} for tx ${tx.getTxHash()}`);
    let publicKernelPublicInput = tx.data.toPublicKernelCircuitPublicInputs();
    let lastKernelArtifact: ProtocolArtifact = 'PrivateKernelTailToPublicArtifact'; // All txs with public calls must carry tail to public proofs
    let finalKernelOutput: KernelCircuitPublicInputs | undefined;
    let revertReason: SimulationError | undefined;
    const gasUsed: ProcessedTx['gasUsed'] = {};
    let phaseCount = 0;
    while (phase) {
      phaseCount++;
      const phaseTimer = new Timer();
      const output = await phase.handle(tx, publicKernelPublicInput, lastKernelArtifact);

      if (output.revertReason) {
        this.metrics.recordRevertedPhase(phase.phase);
      } else {
        this.metrics.recordPhaseDuration(phase.phase, phaseTimer.ms());
      }

      gasUsed[phase.phase] = output.gasUsed;
      if (phase.phase === PublicKernelType.APP_LOGIC) {
        returnValues = output.returnValues;
      }
      publicProvingRequests.push(...output.publicProvingRequests);
      publicKernelPublicInput = output.publicKernelOutput;
      lastKernelArtifact = output.lastKernelArtifact;
      finalKernelOutput = output.finalKernelOutput;
      revertReason ??= output.revertReason;
      phase = PhaseManagerFactory.phaseFromOutput(
        publicKernelPublicInput,
        phase,
        this.db,
        this.publicExecutor,
        this.publicKernel,
        this.globalVariables,
        this.historicalHeader,
        this.publicContractsDB,
        this.publicStateDB,
      );
    }

    if (!finalKernelOutput) {
      this.metrics.recordFailedTx();
      throw new Error('Final public kernel was not executed.');
    }

    this.metrics.recordClassRegistration(
      ...ContractClassRegisteredEvent.fromLogs(tx.unencryptedLogs.unrollLogs(), ClassRegistererAddress),
    );

    this.metrics.recordTx(phaseCount, timer.ms());
    const processedTx = makeProcessedTx(tx, finalKernelOutput, publicProvingRequests, revertReason, gasUsed);
    return [processedTx, returnValues];
  }
}
