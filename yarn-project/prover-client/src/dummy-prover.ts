import { L2Block, ProcessedTx, ProverClient, ProvingResult } from '@aztec/circuit-types';
import { GlobalVariables, makeEmptyProof } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';

export class DummyProver implements ProverClient {
  public start(): Promise<void> {
    return Promise.resolve();
  }

  public stop(): Promise<void> {
    return Promise.resolve();
  }

  public static new(): Promise<DummyProver> {
    return Promise.resolve(new DummyProver());
  }

  startNewBlock(_numTxs: number, _globalVariables: GlobalVariables, _newL1ToL2Messages: Fr[], _newModelL1ToL2Messages: Fr[], _emptyTx: ProcessedTx): Promise<ProvingResult> {
    const result: ProvingResult = {
      proof: makeEmptyProof(),
      block: L2Block.random(1),
    }
    return Promise.resolve(result);
  }

  addNewTx(tx: ProcessedTx): void {}
}
