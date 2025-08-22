import type { BatchedBlob, FinalBlobBatchingChallenges } from '@aztec/blob-lib';
import type { Fr } from '@aztec/foundation/fields';
import type { L2Block } from '@aztec/stdlib/block';
import type { EpochProver } from '@aztec/stdlib/interfaces/server';
import type { Proof } from '@aztec/stdlib/proofs';
import type { RootRollupPublicInputs } from '@aztec/stdlib/rollup';
import type { BlockHeader, GlobalVariables, ProcessedTx, Tx } from '@aztec/stdlib/tx';

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
    firstBlockNumber: number,
    totalNumBlocks: number,
    finalBlobBatchingChallenges: FinalBlobBatchingChallenges,
  ): void {
    this.orchestrator.startNewEpoch(epochNumber, firstBlockNumber, totalNumBlocks, finalBlobBatchingChallenges);
    this.facade.start();
  }
  startTubeCircuits(txs: Tx[]): Promise<void> {
    return this.orchestrator.startTubeCircuits(txs);
  }
  setBlockCompleted(blockNumber: number, expectedBlockHeader?: BlockHeader): Promise<L2Block> {
    return this.orchestrator.setBlockCompleted(blockNumber, expectedBlockHeader);
  }
  finalizeEpoch(): Promise<{ publicInputs: RootRollupPublicInputs; proof: Proof; batchedBlobInputs: BatchedBlob }> {
    return this.orchestrator.finalizeEpoch();
  }
  cancel(): void {
    this.orchestrator.cancel();
  }
  getProverId(): Fr {
    return this.orchestrator.getProverId();
  }
  getBlock(index: number): L2Block {
    return this.orchestrator.getBlock(index);
  }
  async stop(): Promise<void> {
    await this.facade.stop();
    await this.orchestrator.stop();
  }
  startNewBlock(
    globalVariables: GlobalVariables,
    l1ToL2Messages: Fr[],
    previousBlockHeader: BlockHeader,
  ): Promise<void> {
    return this.orchestrator.startNewBlock(globalVariables, l1ToL2Messages, previousBlockHeader);
  }
  addTxs(txs: ProcessedTx[]): Promise<void> {
    return this.orchestrator.addTxs(txs);
  }
}
