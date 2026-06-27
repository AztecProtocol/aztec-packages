import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { P2P } from '@aztec/p2p';
import type { L2BlockSource, L2Tips } from '@aztec/stdlib/block';
import { getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import type { DebugLogStore } from '@aztec/stdlib/logs';
import {
  DroppedTxReceipt,
  type GetTxReceiptOptions,
  type IndexedTxEffect,
  MinedTxReceipt,
  type MinedTxStatus,
  PendingTxReceipt,
  type Tx,
  type TxHash,
  type TxReceipt,
  TxStatus,
} from '@aztec/stdlib/tx';

/** Dependencies required to build a {@link NodeTxReceiptBuilder}. */
export interface NodeTxReceiptBuilderDeps {
  p2pClient: P2P;
  blockSource: L2BlockSource;
  debugLogStore: DebugLogStore;
}

/**
 * Builds transaction receipts by reconciling the archiver's mined tx effects with the tx pool's view,
 * deriving the finalization status from the cached L2 tips. Extracted from `AztecNodeService` to keep
 * `server.ts` smaller.
 */
export class NodeTxReceiptBuilder {
  private readonly p2pClient: P2P;
  private readonly blockSource: L2BlockSource;
  private readonly debugLogStore: DebugLogStore;

  constructor(deps: NodeTxReceiptBuilderDeps) {
    this.p2pClient = deps.p2pClient;
    this.blockSource = deps.blockSource;
    this.debugLogStore = deps.debugLogStore;
  }

  public async getTxReceipt<TGetTxReceiptOptions extends GetTxReceiptOptions = {}>(
    txHash: TxHash,
    options?: TGetTxReceiptOptions,
  ): Promise<TxReceipt<TGetTxReceiptOptions>> {
    // Check the tx pool status first. If the tx is known to the pool (pending or mined), we'll use that
    // as a fallback if we don't find a mined tx effect in the archiver.
    const txPoolStatus = await this.p2pClient.getTxStatus(txHash);
    const isKnownToPool = txPoolStatus === 'pending' || txPoolStatus === 'mined';

    // Then get the raw tx effect from the archiver, which tracks every tx in a mined block.
    const indexed = await this.blockSource.getTxEffect(txHash);

    let receipt: TxReceipt;
    if (indexed) {
      receipt = await this.#assembleMinedReceipt(indexed, options);
    } else if (isKnownToPool) {
      // If the tx is in the pool but not in the archiver, it's pending.
      // This handles race conditions between archiver and p2p, where the archiver
      // has pruned the block in which a tx was mined, but p2p has not caught up yet.
      let tx: Tx | undefined;
      if (options?.includePendingTx) {
        // The tx may have left the pool since we checked its status (mined or dropped); in that case we
        // leave `tx` unset and still return a pending receipt.
        tx = await this.p2pClient.getTxByHashFromPool(txHash, { includeProof: !!options.includeProof });
      }
      receipt = new PendingTxReceipt(txHash, tx);
    } else {
      // Otherwise, if we don't know the tx, we consider it dropped.
      receipt = new DroppedTxReceipt(txHash, 'Tx dropped by P2P node');
    }

    this.debugLogStore.decorateReceiptWithLogs(txHash.toString(), receipt);

    return receipt;
  }

  /**
   * Assembles a {@link MinedTxReceipt} from a raw {@link IndexedTxEffect}, deriving the finalization status from the
   * cached L2 tips and the epoch from the block's slot number.
   */
  async #assembleMinedReceipt(indexed: IndexedTxEffect, options?: GetTxReceiptOptions): Promise<MinedTxReceipt> {
    const blockNumber = indexed.l2BlockNumber;
    const [tips, l1Constants] = await Promise.all([this.blockSource.getL2Tips(), this.blockSource.getL1Constants()]);

    const status = this.#deriveMinedStatus(blockNumber, tips);
    const epochNumber = getEpochAtSlot(indexed.slotNumber, l1Constants);

    return new MinedTxReceipt(
      indexed.data.txHash,
      status,
      MinedTxReceipt.executionResultFromRevertCode(indexed.data.revertCode),
      indexed.data.transactionFee.toBigInt(),
      indexed.l2BlockHash,
      blockNumber,
      indexed.slotNumber,
      indexed.txIndexInBlock,
      epochNumber,
      options?.includeTxEffect ? indexed.data : undefined,
      /*debugLogs=*/ undefined,
    );
  }

  #deriveMinedStatus(blockNumber: BlockNumber, tips: L2Tips): MinedTxStatus {
    if (blockNumber <= tips.finalized.block.number) {
      return TxStatus.FINALIZED;
    } else if (blockNumber <= tips.proven.block.number) {
      return TxStatus.PROVEN;
    } else if (blockNumber <= tips.checkpointed.block.number) {
      return TxStatus.CHECKPOINTED;
    } else {
      return TxStatus.PROPOSED;
    }
  }
}
