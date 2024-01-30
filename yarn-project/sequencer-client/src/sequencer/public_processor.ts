import { PublicExecutor, PublicStateDB } from '@aztec/acir-simulator';
import { ContractDataSource, L1ToL2MessageSource, Tx } from '@aztec/circuit-types';
import { TxSequencerProcessingStats } from '@aztec/circuit-types/stats';
import { BlockHeader, GlobalVariables, Proof, PublicKernelPublicInputs } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { MerkleTreeOperations } from '@aztec/world-state';

import { EmptyPublicProver } from '../prover/empty.js';
import { PublicProver } from '../prover/index.js';
import { PublicKernelCircuitSimulator } from '../simulator/index.js';
import { ContractsDataSourcePublicDB, WorldStateDB, WorldStatePublicDB } from '../simulator/public_executor.js';
import { RealPublicKernelCircuitSimulator } from '../simulator/public_kernel.js';
import { FeePreparationPhaseManager } from './fee_preparation_phase_manager.js';
import { PhaseManager } from './phase_manager.js';
import { FailedTx, ProcessedTx, makeEmptyProcessedTx, makeProcessedTx } from './processed_tx.js';
import { getBlockHeader } from './utils.js';

/**
 * Creates new instances of PublicProcessor given the provided merkle tree db and contract data source.
 */
export class PublicProcessorFactory {
  constructor(
    private merkleTree: MerkleTreeOperations,
    private contractDataSource: ContractDataSource,
    private l1Tol2MessagesDataSource: L1ToL2MessageSource,
  ) {}

  /**
   * Creates a new instance of a PublicProcessor.
   * @param prevGlobalVariables - The global variables for the previous block, used to calculate the prev global variables hash.
   * @param globalVariables - The global variables for the block being processed.
   * @param newContracts - Provides access to contract bytecode for public executions.
   * @returns A new instance of a PublicProcessor.
   */
  public async create(
    prevGlobalVariables: GlobalVariables,
    globalVariables: GlobalVariables,
  ): Promise<PublicProcessor> {
    const blockHeader = await getBlockHeader(this.merkleTree, prevGlobalVariables);
    const publicContractsDB = new ContractsDataSourcePublicDB(this.contractDataSource);
    const worldStatePublicDB = new WorldStatePublicDB(this.merkleTree);
    const worldStateDB = new WorldStateDB(this.merkleTree, this.l1Tol2MessagesDataSource);
    const publicExecutor = new PublicExecutor(worldStatePublicDB, publicContractsDB, worldStateDB, blockHeader);
    return new PublicProcessor(
      this.merkleTree,
      publicExecutor,
      new RealPublicKernelCircuitSimulator(),
      new EmptyPublicProver(),
      globalVariables,
      blockHeader,
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
    protected publicProver: PublicProver,
    protected globalVariables: GlobalVariables,
    protected blockHeader: BlockHeader,
    protected publicContractsDB: ContractsDataSourcePublicDB,
    protected publicStateDB: PublicStateDB,

    private log = createDebugLogger('aztec:sequencer:public-processor'),
  ) {}

  /**
   * Run each tx through the public circuit and the public kernel circuit if needed.
   * @param txs - Txs to process.
   * @returns The list of processed txs with their circuit simulation outputs.
   */
  public async process(txs: Tx[]): Promise<[ProcessedTx[], FailedTx[]]> {
    // The processor modifies the tx objects in place, so we need to clone them.
    txs = txs.map(tx => Tx.clone(tx));
    const result: ProcessedTx[] = [];
    const failed: FailedTx[] = [];

    for (const tx of txs) {
      let phase: PhaseManager | null = new FeePreparationPhaseManager(
        this.db,
        this.publicExecutor,
        this.publicKernel,
        this.publicProver,
        this.globalVariables,
        this.blockHeader,
        this.publicContractsDB,
        this.publicStateDB,
      );
      let publicKernelOutput: PublicKernelPublicInputs | undefined = undefined;
      let publicKernelProof: Proof | undefined = undefined;
      const timer = new Timer();
      try {
        while (phase) {
          const output = await phase.handle(tx, publicKernelOutput, publicKernelProof);
          publicKernelOutput = output.publicKernelOutput;
          publicKernelProof = output.publicKernelProof;
          phase = phase.nextPhase();
        }

        const processedTransaction = await makeProcessedTx(tx, publicKernelOutput!, publicKernelProof!);
        result.push(processedTransaction);

        this.log(`Processed public part of ${tx.data.endAppLogic.newNullifiers[0]}`, {
          eventName: 'tx-sequencer-processing',
          duration: timer.ms(),
          publicDataUpdateRequests:
            processedTransaction.data.endAppLogic.publicDataUpdateRequests.filter(x => !x.leafSlot.isZero()).length ??
            0,
          ...tx.getStats(),
        } satisfies TxSequencerProcessingStats);
      } catch (err) {
        const failedTx = await phase!.rollback(tx, err);
        failed.push(failedTx);
      }
    }

    return [result, failed];
  }

  /**
   * Makes an empty processed tx. Useful for padding a block to a power of two number of txs.
   * @returns A processed tx with empty data.
   */
  public makeEmptyProcessedTx(): Promise<ProcessedTx> {
    const { chainId, version } = this.globalVariables;
    return makeEmptyProcessedTx(this.blockHeader, chainId, version);
  }
}
