import type { BlockNumber } from '@aztec/foundation/branded-types';
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

import type { NodeTxGateway } from './node_tx_gateway.js';

/** Dependencies required to build a {@link NodeTxReceiptBuilder}. */
export interface NodeTxReceiptBuilderDeps {
  txGateway: NodeTxGateway;
  blockSource: L2BlockSource;
  debugLogStore: DebugLogStore;
}

/**
 * Builds transaction receipts by reconciling the archiver's mined tx effects with the view of the node's tx
 * gateway (its mempool, or its upstream node when running as a follower), deriving the finalization status
 * from the cached L2 tips. Extracted from `AztecNodeService` to keep `server.ts` smaller.
 *
 * A mined receipt is only ever built from the local archiver, never from what the gateway reports: on a
 * follower, a tx already mined upstream may reference a block this node has not replicated yet, and answering
 * "mined in block N" for a block the node cannot serve would break every caller that follows the receipt up
 * with a query at that block. Such a tx is reported as pending until the block is local.
 */
export class NodeTxReceiptBuilder {
  private readonly txGateway: NodeTxGateway;
  private readonly blockSource: L2BlockSource;
  private readonly debugLogStore: DebugLogStore;

  constructor(deps: NodeTxReceiptBuilderDeps) {
    this.txGateway = deps.txGateway;
    this.blockSource = deps.blockSource;
    this.debugLogStore = deps.debugLogStore;
  }

  public async getTxReceipt<TGetTxReceiptOptions extends GetTxReceiptOptions = {}>(
    txHash: TxHash,
    options?: TGetTxReceiptOptions,
  ): Promise<TxReceipt<TGetTxReceiptOptions>> {
    // The archiver tracks every tx in a mined block, and is the only source a mined receipt is built from.
    const indexed = await this.blockSource.getTxEffect(txHash);

    let receipt: TxReceipt;
    if (indexed) {
      receipt = await this.#assembleMinedReceipt(indexed, options);
    } else if (await this.txGateway.hasUnminedTx(txHash)) {
      // The tx is known to the gateway but not to the archiver, so it is pending. On a full node this also
      // covers the race where the archiver pruned the block a tx was mined in and the pool has not caught up
      // yet; on a follower it covers a tx mined upstream in a block that is not replicated yet.
      let tx: Tx | undefined;
      if (options?.includePendingTx) {
        // The tx may have left the gateway since we checked its status (mined or dropped); in that case we
        // leave `tx` unset and still return a pending receipt.
        tx = await this.txGateway.getTxByHash(txHash, { includeProof: !!options.includeProof });
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
