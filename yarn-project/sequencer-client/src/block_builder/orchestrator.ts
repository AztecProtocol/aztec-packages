import { TestCircuitProver } from '@aztec/bb-prover';
import {
  type BlockBuilder,
  type L2Block,
  type MerkleTreeWriteOperations,
  type ProcessedTx,
} from '@aztec/circuit-types';
import { type Fr, type GlobalVariables } from '@aztec/circuits.js';
import { ProvingOrchestrator } from '@aztec/prover-client/orchestrator';
import { type SimulationProvider } from '@aztec/simulator';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

/**
 * Implements a block simulator using a test circuit prover under the hood, which just simulates circuits and outputs empty proofs.
 * This class is unused at the moment, but could be leveraged by a prover-node to ascertain that it can prove a block before
 * committing to proving it by sending a quote.
 */
export class OrchestratorBlockBuilder implements BlockBuilder {
  private orchestrator: ProvingOrchestrator;
  constructor(db: MerkleTreeWriteOperations, simulationProvider: SimulationProvider, telemetry: TelemetryClient) {
    const testProver = new TestCircuitProver(telemetry, simulationProvider);
    this.orchestrator = new ProvingOrchestrator(db, testProver, telemetry);
  }

  startNewBlock(numTxs: number, globalVariables: GlobalVariables, l1ToL2Messages: Fr[]): Promise<void> {
    return this.orchestrator.startNewBlock(numTxs, globalVariables, l1ToL2Messages);
  }
  setBlockCompleted(): Promise<L2Block> {
    return this.orchestrator.setBlockCompleted();
  }
  addNewTx(tx: ProcessedTx): Promise<void> {
    return this.orchestrator.addNewTx(tx);
  }
}

export class OrchestratorBlockBuilderFactory {
  constructor(private simulationProvider: SimulationProvider, private telemetry?: TelemetryClient) {}

  create(db: MerkleTreeWriteOperations): BlockBuilder {
    return new OrchestratorBlockBuilder(db, this.simulationProvider, this.telemetry ?? new NoopTelemetryClient());
  }
}
