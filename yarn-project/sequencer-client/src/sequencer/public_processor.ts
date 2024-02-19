import { ContractDataSource, L1ToL2MessageSource, Tx } from '@aztec/circuit-types';
import { TxSequencerProcessingStats } from '@aztec/circuit-types/stats';
import { GlobalVariables, Header } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { PublicExecutor, PublicStateDB } from '@aztec/simulator';
import { MerkleTreeOperations } from '@aztec/world-state';

import { EmptyPublicProver } from '../prover/empty.js';
import { PublicProver } from '../prover/index.js';
import { PublicKernelCircuitSimulator } from '../simulator/index.js';
import { ContractsDataSourcePublicDB, WorldStateDB, WorldStatePublicDB } from '../simulator/public_executor.js';
import { RealPublicKernelCircuitSimulator } from '../simulator/public_kernel.js';
import { AbstractPhaseManager } from './abstract_phase_manager.js';
import { PhaseManagerFactory } from './phase_manager_factory.js';
import { FailedTx, ProcessedTx, makeEmptyProcessedTx, makeProcessedTx } from './processed_tx.js';

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
    const worldStateDB = new WorldStateDB(this.merkleTree, this.l1Tol2MessagesDataSource);
    const publicExecutor = new PublicExecutor(worldStatePublicDB, publicContractsDB, worldStateDB, historicalHeader);
    return new PublicProcessor(
      this.merkleTree,
      publicExecutor,
      new RealPublicKernelCircuitSimulator(),
      new EmptyPublicProver(),
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
    protected publicProver: PublicProver,
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
  public async process(txs: Tx[]): Promise<[ProcessedTx[], FailedTx[]]> {
    // The processor modifies the tx objects in place, so we need to clone them.
    txs = txs.map(tx => Tx.clone(tx));
    const result: ProcessedTx[] = [];
    const failed: FailedTx[] = [];

    for (const tx of txs) {
      let phase: AbstractPhaseManager | undefined = PhaseManagerFactory.phaseFromTx(
        tx,
        this.db,
        this.publicExecutor,
        this.publicKernel,
        this.publicProver,
        this.globalVariables,
        this.historicalHeader,
        this.publicContractsDB,
        this.publicStateDB,
      );
      this.log(`Beginning processing in phase ${phase?.phase} for tx ${tx.getTxHash()}`);
      let { publicKernelPublicInput, publicKernelProof } = AbstractPhaseManager.getKernelOutputAndProof(
        tx,
        undefined,
        undefined,
      );
      const timer = new Timer();
      try {
        while (phase) {
          const output = await phase.handle(tx, publicKernelPublicInput, publicKernelProof);
          publicKernelPublicInput = output.publicKernelOutput;
          publicKernelProof = output.publicKernelProof;
          phase = PhaseManagerFactory.phaseFromOutput(
            publicKernelPublicInput,
            phase,
            this.db,
            this.publicExecutor,
            this.publicKernel,
            this.publicProver,
            this.globalVariables,
            this.historicalHeader,
            this.publicContractsDB,
            this.publicStateDB,
          );
        }

        const processedTransaction = makeProcessedTx(tx, publicKernelPublicInput, publicKernelProof);
        result.push(processedTransaction);

        this.log(`Processed public part of ${tx.data.endNonRevertibleData.newNullifiers[0]}`, {
          eventName: 'tx-sequencer-processing',
          duration: timer.ms(),
          publicDataUpdateRequests:
            processedTransaction.data.combinedData.publicDataUpdateRequests.filter(x => !x.leafSlot.isZero()).length ??
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
  public makeEmptyProcessedTx(): ProcessedTx {
    const { chainId, version } = this.globalVariables;
    return makeEmptyProcessedTx(this.historicalHeader, chainId, version);
  }
}
