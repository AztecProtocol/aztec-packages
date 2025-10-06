import { Fr } from '@aztec/foundation/fields';
import type { ExecutionNoteCache } from '@aztec/pxe/simulator';
import { computeNoteHashNonce, computeUniqueNoteHash, siloNoteHash } from '@aztec/stdlib/hash';
import { TxEffect, TxHash } from '@aztec/stdlib/tx';

export async function makeTxEffect(
  noteCache: ExecutionNoteCache,
  txRequestHash: Fr,
  txBlockNumber: number,
): Promise<TxEffect> {
  const txEffect = TxEffect.empty();

  const { usedTxRequestHashForNonces } = noteCache.finish();
  const nonceGenerator = usedTxRequestHashForNonces ? txRequestHash : noteCache.getAllNullifiers()[0];

  txEffect.noteHashes = await Promise.all(
    noteCache
      .getAllNotes()
      .map(async (pendingNote, i) =>
        computeUniqueNoteHash(
          await computeNoteHashNonce(nonceGenerator, i),
          await siloNoteHash(pendingNote.note.contractAddress, pendingNote.noteHashForConsumption),
        ),
      ),
  );

  // Nullifiers are already siloed
  txEffect.nullifiers = noteCache.getAllNullifiers();

  if (usedTxRequestHashForNonces) {
    txEffect.nullifiers.unshift(txRequestHash);
  }

  txEffect.txHash = new TxHash(new Fr(txBlockNumber));

  return txEffect;
}
