import type { PeerId } from '@libp2p/interface';

import type { BlockProposal } from '../p2p/block_proposal.js';
import type { Tx } from '../tx/tx.js';
import type { TxHash } from '../tx/tx_hash.js';

export interface ITxCollector {
  collectTransactions(
    txHashes: TxHash[],
    peerWhoSentTheProposal: PeerId | undefined,
  ): Promise<{ txs: Tx[]; missing?: TxHash[] }>;

  collectForBlockProposal(
    proposal: BlockProposal,
    peerWhoSentTheProposal: PeerId | undefined,
  ): Promise<{ txs: Tx[]; missing?: TxHash[] }>;
}
