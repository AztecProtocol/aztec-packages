import { L2Block, ProcessedTx, ProverClient } from '@aztec/circuit-types';
import { GlobalVariables, Proof, makeEmptyProof } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';

export class DummyProver implements ProverClient {
    public start(): Promise<void> {
      return Promise.resolve();
    }

    public stop(): Promise<void> {
      return Promise.resolve();
    }

    public static new(): Promise<ProverClient> {
      return Promise.resolve(new DummyProver());
    }

    public proveBlock(
      _globalVariables: GlobalVariables,
      _txs: ProcessedTx[],
      _newModelL1ToL2Messages: Fr[], // TODO(#4492): Rename this when purging the old inbox
      _newL1ToL2Messages: Fr[], // TODO(#4492): Nuke this when purging the old inbox
    ): Promise<[L2Block, Proof]> {
      return Promise.resolve([L2Block.random(1), makeEmptyProof()]);
    }
}