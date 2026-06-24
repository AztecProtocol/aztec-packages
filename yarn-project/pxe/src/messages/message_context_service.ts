import { uniqueBy } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import type { MessageContext } from '@aztec/stdlib/logs';
import { type IndexedTxEffect, TxHash } from '@aztec/stdlib/tx';

/** Resolves transaction hashes into the context needed to process messages. */
export class MessageContextService {
  constructor(private readonly aztecNode: AztecNode) {}

  /**
   * Resolves a list of tx hashes into their message contexts.
   *
   * For each tx hash, looks up the corresponding tx effect and extracts the note hashes and first nullifier needed to
   * process messages that originated from that transaction. Returns `null` for tx hashes that are zero, not yet
   * available, or in blocks beyond the anchor block.
   */
  async getMessageContextsByTxHash(txHashes: Fr[], anchorBlockNumber: number): Promise<(MessageContext | null)[]> {
    const nonZeroTxHashes = txHashes.filter(h => !h.isZero()).map(h => TxHash.fromField(h));
    const uniqueTxHashes = uniqueBy(nonZeroTxHashes, h => h.toString());
    const fetched = await Promise.all(
      uniqueTxHashes.map(h => this.aztecNode.getTxReceipt(h, { includeTxEffect: true })),
    );
    const txEffects = new Map(
      uniqueTxHashes
        .map((h, i): [string, IndexedTxEffect | undefined] => {
          const receipt = fetched[i];
          if (!receipt.isMined() || !receipt.txEffect) {
            return [h.toString(), undefined];
          }
          return [
            h.toString(),
            {
              data: receipt.txEffect,
              l2BlockNumber: receipt.blockNumber,
              l2BlockHash: receipt.blockHash,
              txIndexInBlock: receipt.txIndexInBlock,
              slotNumber: receipt.slotNumber,
            },
          ];
        })
        .filter((entry): entry is [string, IndexedTxEffect] => entry[1] !== undefined),
    );

    return txHashes.map(txHashField => {
      const txHash = TxHash.fromField(txHashField);
      const txEffect = txEffects.get(txHash.toString());
      if (!txEffect || txEffect.l2BlockNumber > anchorBlockNumber) {
        return null;
      }

      // Every tx has at least one nullifier (the first nullifier derived from the tx hash). Hitting this condition
      // would mean a buggy node, but since we need to access data.nullifiers[0], the defensive check does no harm.
      const data = txEffect.data;
      if (data.nullifiers.length === 0) {
        throw new Error(`Tx effect for ${txHash} has no nullifiers`);
      }

      return {
        txHash: data.txHash,
        uniqueNoteHashesInTx: data.noteHashes,
        firstNullifierInTx: data.nullifiers[0],
      };
    });
  }
}
