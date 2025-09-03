import type { L2Block } from '@aztec/stdlib/block';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { type Tx, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';

export interface ITxProvider {
  getAvailableTxs(txHashes: TxHash[]): Promise<{ txs: Tx[]; missingTxs: TxHash[] }>;

  getTxsForBlockProposal(
    blockProposal: BlockProposal,
    opts: { pinnedPeer: PeerId | undefined; deadline: Date },
  ): Promise<{ txs: Tx[]; missingTxs: TxHash[] }>;

  getTxsForBlock(block: L2Block, opts: { deadline: Date }): Promise<{ txs: Tx[]; missingTxs: TxHash[] }>;
}
