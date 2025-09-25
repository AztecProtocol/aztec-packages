import type { BatchedBlob, FinalBlobBatchingChallenges } from '@aztec/blob-lib';
import type { Fr } from '@aztec/foundation/fields';
import type { EthAddress } from '@aztec/stdlib/block';
import type { EpochProver } from '@aztec/stdlib/interfaces/server';
import type { Proof } from '@aztec/stdlib/proofs';
import type { CheckpointConstantData, RootRollupPublicInputs } from '@aztec/stdlib/rollup';
import type { BlockHeader, ProcessedTx, Tx } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

import type { ProvingOrchestrator } from '../orchestrator/orchestrator.js';
import type { BrokerCircuitProverFacade } from '../proving_broker/broker_prover_facade.js';

/** Encapsulates the proving orchestrator and the broker facade */
export class ServerEpochProver implements EpochProver {
  constructor(
    private facade: BrokerCircuitProverFacade,
    private orchestrator: ProvingOrchestrator,
  ) {}

  startNewEpoch(
    epochNumber: number,
    totalNumCheckpoints: number,
    finalBlobBatchingChallenges: FinalBlobBatchingChallenges,
  ): void {
    this.orchestrator.startNewEpoch(epochNumber, totalNumCheckpoints, finalBlobBatchingChallenges);
    this.facade.start();
  }
  startNewCheckpoint(
    checkpointIndex: number,
    constants: CheckpointConstantData,
    l1ToL2Messages: Fr[],
    totalNumBlocks: number,
    totalNumBlobFields: number,
    headerOfLastBlockInPreviousCheckpoint: BlockHeader,
  ): Promise<void> {
    return this.orchestrator.startNewCheckpoint(
      checkpointIndex,
      constants,
      l1ToL2Messages,
      totalNumBlocks,
      totalNumBlobFields,
      headerOfLastBlockInPreviousCheckpoint,
    );
  }
  startTubeCircuits(txs: Tx[]): Promise<void> {
    return this.orchestrator.startTubeCircuits(txs);
  }
  setBlockCompleted(blockNumber: number, expectedBlockHeader?: BlockHeader): Promise<BlockHeader> {
    return this.orchestrator.setBlockCompleted(blockNumber, expectedBlockHeader);
  }
  finalizeEpoch(): Promise<{ publicInputs: RootRollupPublicInputs; proof: Proof; batchedBlobInputs: BatchedBlob }> {
    return this.orchestrator.finalizeEpoch();
  }
  cancel(): void {
    this.orchestrator.cancel();
  }
  getProverId(): EthAddress {
    return this.orchestrator.getProverId();
  }
  async stop(): Promise<void> {
    await this.facade.stop();
    await this.orchestrator.stop();
  }
  startNewBlock(blockNumber: number, timestamp: UInt64, totalNumTxs: number): Promise<void> {
    return this.orchestrator.startNewBlock(blockNumber, timestamp, totalNumTxs);
  }
  addTxs(txs: ProcessedTx[]): Promise<void> {
    return this.orchestrator.addTxs(txs);
  }
}
