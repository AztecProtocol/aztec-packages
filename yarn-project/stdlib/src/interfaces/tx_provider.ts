import type { L2Block } from '@aztec/stdlib/block';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { type Tx, TxHash } from '@aztec/stdlib/tx';

import type { PeerId } from '@libp2p/interface';

export interface ITxProvider {
  getAvailableTxs(txHashes: TxHash[]): Promise<{ txs: Tx[]; missingTxs: TxHash[] }>;

  /**
   * Checks whether each tx hash is currently held by the local tx pool. Returns a parallel
   * boolean array (one entry per input hash). Does not fetch from the network.
   */
  hasTxs(txHashes: TxHash[]): Promise<boolean[]>;

  /**
   * Collects the txs for a block proposal from the tx pool, the proposal body, and the network.
   * @throws InvalidBlockProposalTxsError - If a tx carried in the proposal fails minimum integrity validation.
   */
  getTxsForBlockProposal(
    blockProposal: BlockProposal,
    blockNumber: number,
    opts: { pinnedPeer: PeerId | undefined; deadline: Date },
  ): Promise<{ txs: Tx[]; missingTxs: TxHash[] }>;

  getTxsForBlock(block: L2Block, opts: { deadline: Date }): Promise<{ txs: Tx[]; missingTxs: TxHash[] }>;
}
