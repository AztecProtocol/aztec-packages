import { uniqueBy } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { type IndexedTxEffect, TxHash } from '@aztec/stdlib/tx';

import type { ResolvedTx } from '../contract_function_simulator/noir-structs/resolved_tx.js';

/** Resolves transaction hashes into their on-chain context (note hashes, first nullifier, and mined block). */
export class TxResolverService {
  constructor(private readonly aztecNode: AztecNode) {}

  /**
   * Resolves a list of tx hashes into their on-chain context.
   *
   * For each tx hash, looks up the corresponding tx effect and extracts the note hashes, first nullifier, and the
   * number and hash of the block it was mined in. Returns `null` for tx hashes that are zero, not yet available, or in
   * blocks beyond the anchor block.
   */
  async resolveTxs(txHashes: Fr[], anchorBlockNumber: number): Promise<(ResolvedTx | null)[]> {
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
        blockNumber: txEffect.l2BlockNumber,
        blockHash: txEffect.l2BlockHash.toFr(),
      };
    });
  }
}
