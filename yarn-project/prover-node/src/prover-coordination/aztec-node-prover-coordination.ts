import type { AztecNode, EpochProofQuote, ProverCoordination, Tx, TxHash } from '@aztec/circuit-types';

/** Implements ProverCoordinator by wrapping an Aztec node */
export class AztecNodeProverCoordination implements ProverCoordination {
  constructor(private node: AztecNode) {}

  getTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    return this.node.getTxByHash(txHash);
  }

  addEpochProofQuote(quote: EpochProofQuote): Promise<void> {
    return this.node.addEpochProofQuote(quote);
  }
}
