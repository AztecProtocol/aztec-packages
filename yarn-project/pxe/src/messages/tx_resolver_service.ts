import type { BlockNumber } from '@aztec/foundation/branded-types';
import { uniqueBy } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { BlockHash } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { type IndexedTxEffect, TxHash } from '@aztec/stdlib/tx';

/** Resolves transaction hashes into their on-chain context (note hashes, nullifiers, and mined position). */
export class TxResolverService {
  constructor(private readonly aztecNode: AztecNode) {}

  /**
   * Resolves a list of tx hashes into their on-chain context.
   *
   * For each tx hash, looks up the corresponding tx effect and extracts its note hashes and nullifiers, and the
   * position it was mined at. Returns `null` for tx hashes that are zero, not yet available, or in blocks beyond the
   * anchor block.
   */
  async resolveTxs(txHashes: Fr[], anchorBlockNumber: number): Promise<(TxOnchainContext | null)[]> {
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
      // would mean a buggy node, but since consumers rely on nullifiers[0], the defensive check does no harm.
      const data = txEffect.data;
      if (data.nullifiers.length === 0) {
        throw new Error(`Tx effect for ${txHash} has no nullifiers`);
      }

      return {
        txHash: data.txHash,
        noteHashes: data.noteHashes,
        nullifiers: data.nullifiers,
        blockNumber: txEffect.l2BlockNumber,
        blockHash: txEffect.l2BlockHash,
        txIndexInBlock: txEffect.txIndexInBlock,
      };
    });
  }
}

/** The onchain context of a tx: the position it was mined at, and the effects it produced. */
export type TxOnchainContext = {
  txHash: TxHash;
  noteHashes: Fr[];
  nullifiers: Fr[];
  blockNumber: BlockNumber;
  blockHash: BlockHash;
  txIndexInBlock: number;
};
