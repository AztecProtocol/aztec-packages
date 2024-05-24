import {
  type BlockProver,
  type FailedTx,
  NestedProcessReturnValues,
  type ProcessedTx,
  type PublicKernelRequest,
  type SimulationError,
  Tx,
  type TxValidator,
  makeEmptyProcessedTx,
  makeProcessedTx,
  toTxEffect,
  validateProcessedTx,
} from '@aztec/circuit-types';
import { type TxSequencerProcessingStats } from '@aztec/circuit-types/stats';
import {
  AztecAddress,
  GAS_TOKEN_ADDRESS,
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
import {
  PublicExecutor,
  type PublicStateDB,
  type SimulationProvider,
  computeFeePayerBalanceLeafSlot,
  computeFeePayerBalanceStorageSlot,
} from '@aztec/simulator';
import { type ContractDataSource } from '@aztec/types/contracts';
import { type MerkleTreeOperations } from '@aztec/world-state';

import {
  type AbstractPhaseManager,
  PublicKernelPhase,
  publicKernelPhaseToKernelType,
} from './abstract_phase_manager.js';
import { PhaseManagerFactory } from './phase_manager_factory.js';
import { ContractsDataSourcePublicDB, WorldStateDB, WorldStatePublicDB } from './public_executor.js';
import { RealPublicKernelCircuitSimulator } from './public_kernel.js';
import { type PublicKernelCircuitSimulator } from './public_kernel_circuit_simulator.js';

/**
 * Creates new instances of PublicProcessor given the provided merkle tree db and contract data source.
 */
export class PublicProcessorFactory {
  constructor(
    private merkleTree: MerkleTreeOperations,
    private contractDataSource: ContractDataSource,
    private simulator: SimulationProvider,
  ) {}

  /**
   * Creates a new instance of a PublicProcessor.
   * @param historicalHeader - The header of a block previous to the one in which the tx is included.
   * @param globalVariables - The global variables for the block being processed.
   * @param newContracts - Provides access to contract bytecode for public executions.
   * @returns A new instance of a PublicProcessor.
   */
  public async create(
    historicalHeader: Header | undefined,
    globalVariables: GlobalVariables,
  ): Promise<PublicProcessor> {
    historicalHeader = historicalHeader ?? (await this.merkleTree.buildInitialHeader());

    const publicContractsDB = new ContractsDataSourcePublicDB(this.contractDataSource);
    const worldStatePublicDB = new WorldStatePublicDB(this.merkleTree);
    const worldStateDB = new WorldStateDB(this.merkleTree);
    const publicExecutor = new PublicExecutor(worldStatePublicDB, publicContractsDB, worldStateDB, historicalHeader);
    return new PublicProcessor(
      this.merkleTree,
      publicExecutor,
      new RealPublicKernelCircuitSimulator(this.simulator),
      globalVariables,
      historicalHeader,
      publicContractsDB,
      worldStatePublicDB,
    );
  }
}

/**
 * Converts Txs lifted from the P2P module into ProcessedTx objects by executing
 * any public function calls in them. Txs with private calls only are unaffected.
 */
export class PublicProcessor {
  constructor(
    protected db: MerkleTreeOperations,
    protected publicExecutor: PublicExecutor,
    protected publicKernel: PublicKernelCircuitSimulator,
    protected globalVariables: GlobalVariables,
    protected historicalHeader: Header,
    protected publicContractsDB: ContractsDataSourcePublicDB,
    protected publicStateDB: PublicStateDB,

    private log = createDebugLogger('aztec:sequencer:public-processor'),
  ) {}

  /**
   * Run each tx through the public circuit and the public kernel circuit if needed.
   * @param txs - Txs to process.
   * @returns The list of processed txs with their circuit simulation outputs.
   */
  public async process(
    txs: Tx[],
    maxTransactions = txs.length,
    blockProver?: BlockProver,
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
          ? [makeProcessedTx(tx, tx.data.toKernelCircuitPublicInputs(), tx.proof, [])]
          : await this.processTxWithPublicCalls(tx);

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
        // if we were given a prover then send the transaction to it for proving
        if (blockProver) {
          await blockProver.addNewTx(processedTx);
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

    const gasToken = AztecAddress.fromBigInt(GAS_TOKEN_ADDRESS);
    const balanceSlot = computeFeePayerBalanceStorageSlot(feePayer);
    const leafSlot = computeFeePayerBalanceLeafSlot(feePayer);
    const txFee = tx.data.getTransactionFee(this.globalVariables.gasFees);

    this.log.debug(`Deducting ${txFee} balance in gas tokens for ${feePayer}`);

    const existingBalanceWriteIndex = finalPublicDataUpdateRequests.findIndex(request =>
      request.leafSlot.equals(leafSlot),
    );

    const balance =
      existingBalanceWriteIndex > -1
        ? finalPublicDataUpdateRequests[existingBalanceWriteIndex].newValue
        : await this.publicStateDB.storageRead(gasToken, balanceSlot);

    if (balance.lt(txFee)) {
      throw new Error(`Not enough balance for fee payer to pay for transaction (got ${balance} needs ${txFee})`);
    }

    const updatedBalance = balance.sub(txFee);
    await this.publicStateDB.storageWrite(gasToken, balanceSlot, updatedBalance);

    finalPublicDataUpdateRequests[
      existingBalanceWriteIndex > -1 ? existingBalanceWriteIndex : MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
    ] = new PublicDataUpdateRequest(leafSlot, updatedBalance);

    return finalPublicDataUpdateRequests;
  }

  /**
   * Makes an empty processed tx. Useful for padding a block to a power of two number of txs.
   * @returns A processed tx with empty data.
   */
  public makeEmptyProcessedTx(): ProcessedTx {
    const { chainId, version } = this.globalVariables;
    return makeEmptyProcessedTx(this.historicalHeader.clone(), chainId, version);
  }

  private async processTxWithPublicCalls(tx: Tx): Promise<[ProcessedTx, NestedProcessReturnValues[]]> {
    let returnValues: NestedProcessReturnValues[] = [];
    const publicRequests: PublicKernelRequest[] = [];
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
    let finalKernelOutput: KernelCircuitPublicInputs | undefined;
    let revertReason: SimulationError | undefined;
    const timer = new Timer();
    const gasUsed: ProcessedTx['gasUsed'] = {};
    while (phase) {
      const output = await phase.handle(tx, publicKernelPublicInput);
      gasUsed[publicKernelPhaseToKernelType(phase.phase)] = output.gasUsed;
      if (phase.phase === PublicKernelPhase.APP_LOGIC) {
        returnValues = output.returnValues;
      }
      publicRequests.push(...output.kernelRequests);
      publicKernelPublicInput = output.publicKernelOutput;
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
      throw new Error('Final public kernel was not executed.');
    }

    const processedTx = makeProcessedTx(tx, finalKernelOutput, tx.proof, publicRequests, revertReason, gasUsed);

    this.log.debug(`Processed public part of ${tx.getTxHash()}`, {
      eventName: 'tx-sequencer-processing',
      duration: timer.ms(),
      effectsSize: toTxEffect(processedTx, this.globalVariables.gasFees).toBuffer().length,
      publicDataUpdateRequests:
        processedTx.data.end.publicDataUpdateRequests.filter(x => !x.leafSlot.isZero()).length ?? 0,
      ...tx.getStats(),
    } satisfies TxSequencerProcessingStats);

    return [processedTx, returnValues];
  }
}
