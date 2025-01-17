import { type EpochProver, type L2Block, type ProcessedTx, type Tx } from '@aztec/circuit-types';
import { type BlockHeader, type Fr, type GlobalVariables, type Proof } from '@aztec/circuits.js';
import { type RootRollupPublicInputs } from '@aztec/circuits.js/rollup';

import { type ProvingOrchestrator } from '../orchestrator/orchestrator.js';
import { type BrokerCircuitProverFacade } from '../proving_broker/broker_prover_facade.js';

/** Encapsulates the proving orchestrator and the broker facade */
export class ServerEpochProver implements EpochProver {
  constructor(private facade: BrokerCircuitProverFacade, private orchestrator: ProvingOrchestrator) {}

  startNewEpoch(epochNumber: number, firstBlockNumber: number, totalNumBlocks: number): void {
    this.orchestrator.startNewEpoch(epochNumber, firstBlockNumber, totalNumBlocks);
    this.facade.start();
  }
  startTubeCircuits(txs: Tx[]): void {
    this.orchestrator.startTubeCircuits(txs);
  }
  setBlockCompleted(blockNumber: number, expectedBlockHeader?: BlockHeader): Promise<L2Block> {
    return this.orchestrator.setBlockCompleted(blockNumber, expectedBlockHeader);
  }
  finaliseEpoch(): Promise<{ publicInputs: RootRollupPublicInputs; proof: Proof }> {
    return this.orchestrator.finaliseEpoch();
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
