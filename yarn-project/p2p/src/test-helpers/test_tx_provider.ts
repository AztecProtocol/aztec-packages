import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { L2Block } from '@aztec/stdlib/block';
import type { ITxProvider } from '@aztec/stdlib/interfaces/server';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { type Tx, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';

/**
 * Test transaction provider that can be seeded with transactions.
 * Returns seeded txs when requested by hash, useful for testing block
 * proposal handling without requiring a full P2P network.
 */
export class TestTxProvider implements ITxProvider {
  private txs: Map<string, Tx> = new Map();

  /** Seed transactions that will be returned when requested. */
  seed(txs: Tx[]) {
    for (const tx of txs) {
      this.txs.set(tx.getTxHash().toString(), tx);
    }
  }

  /** Clear all seeded transactions. */
  clear() {
    this.txs.clear();
  }

  /** Returns txs from the seeded collection given their hashes. */
  getAvailableTxs(txHashes: TxHash[]): Promise<{ txs: Tx[]; missingTxs: TxHash[] }> {
    return this.getTxsByHashes(txHashes);
  }

  /** Returns whether each tx hash is in the seeded collection. */
  hasTxs(txHashes: TxHash[]): Promise<boolean[]> {
    return Promise.resolve(txHashes.map(h => this.txs.has(h.toString())));
  }

  /** Get txs for a block proposal, returning any seeded txs that match the requested hashes. */
  getTxsForBlockProposal(
    blockProposal: BlockProposal,
    _blockNumber: BlockNumber,
    _opts: { pinnedPeer: PeerId | undefined; deadline: Date },
  ): Promise<{ txs: Tx[]; missingTxs: TxHash[] }> {
    return this.getTxsByHashes(blockProposal.txHashes);
  }

  /** Get txs for a block, returning any seeded txs that match the tx effects in the block. */
  getTxsForBlock(block: L2Block, _opts: { deadline: Date }): Promise<{ txs: Tx[]; missingTxs: TxHash[] }> {
    const txHashes = block.body.txEffects.map(txEffect => txEffect.txHash);
    return this.getTxsByHashes(txHashes);
  }

  private getTxsByHashes(txHashes: TxHash[]): Promise<{ txs: Tx[]; missingTxs: TxHash[] }> {
    const txs: Tx[] = [];
    const missingTxs: TxHash[] = [];

    for (const txHash of txHashes) {
      const tx = this.txs.get(txHash.toString());
      if (tx) {
        txs.push(tx);
      } else {
        missingTxs.push(txHash);
      }
    }

    return Promise.resolve({ txs, missingTxs });
  }
}
