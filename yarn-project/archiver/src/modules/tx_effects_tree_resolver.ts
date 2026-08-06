import type { BlockNumber } from '@aztec/foundation/branded-types';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { L2Block } from '@aztec/stdlib/block';
import {
  type IndexedTxEffect,
  type TxEffectMembershipWitness,
  type TxHash,
  computeTxEffectMembershipWitness,
} from '@aztec/stdlib/tx';

/**
 * Archiver-side view of the data the resolver needs to assemble a witness. The archiver implements each of these
 * natively, so no L2 RPC plumbing is required.
 */
export interface TxEffectsTreeArchiverView {
  getBlock(query: { number: BlockNumber }): Promise<L2Block | undefined>;
  getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined>;
}

/**
 * Builds membership witnesses against a block's tx effects tree root.
 *
 * Nothing is cached: the tree is rebuilt per request from the tx effects the archiver already stores, and the rebuilt
 * root is checked against the root the block header commits to.
 */
export class TxEffectsTreeResolver {
  constructor(
    private readonly archiver: TxEffectsTreeArchiverView,
    private readonly store: AztecAsyncKVStore,
    private readonly log: Logger = createLogger('archiver:tx_effects_tree'),
  ) {}

  /**
   * Builds the membership witness proving that `txHash` was included in its block and produced exactly the effects the
   * archiver stores for it. Returns `undefined` if the tx is not in a block the archiver knows about.
   *
   * Throws if the tree rebuilt from the stored tx effects does not hash up to the root in the block header, which
   * would mean the stored block is corrupted.
   */
  public async getTxEffectMembershipWitness(txHash: TxHash): Promise<TxEffectMembershipWitness | undefined> {
    // Read the tx effect and its block within a single store transaction so the tx index cannot be paired with the tx
    // effects of a different chain state, which would surface as a spurious root mismatch below.
    return await this.store.transactionAsync(async () => {
      const indexed = await this.archiver.getTxEffect(txHash);
      if (!indexed) {
        this.log.trace(`No tx effect for tx, no witness available`, { txHash });
        return undefined;
      }

      const blockNumber = indexed.l2BlockNumber;
      const block = await this.archiver.getBlock({ number: blockNumber });
      if (!block) {
        this.log.trace(`No block for tx, no witness available`, { txHash, blockNumber });
        return undefined;
      }

      const txEffects = block.body.txEffects;
      const txIndexInBlock = indexed.txIndexInBlock;
      if (!txEffects[txIndexInBlock]?.txHash.equals(txHash)) {
        throw new Error(
          `Tx ${txHash} is indexed at position ${txIndexInBlock} of block ${blockNumber} but that position holds ` +
            `${txEffects[txIndexInBlock]?.txHash ?? 'no tx'}`,
        );
      }

      const { root, leafIndex, siblingPath } = await computeTxEffectMembershipWitness(txEffects, txIndexInBlock);
      if (!root.equals(block.header.txEffectsTreeRoot)) {
        throw new Error(
          `Tx effects tree root rebuilt from the tx effects of block ${blockNumber} does not match its header: ` +
            `rebuilt=${root} header=${block.header.txEffectsTreeRoot}`,
        );
      }

      return { blockNumber, root, leafIndex, siblingPath };
    });
  }
}
