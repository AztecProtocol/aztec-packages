import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { ExecutionNoteCache } from '@aztec/pxe/simulator';
import { computeNoteHashNonce, computeUniqueNoteHash, siloNoteHash } from '@aztec/stdlib/hash';
import { TxEffect, TxHash } from '@aztec/stdlib/tx';

export async function makeTxEffect(noteCache: ExecutionNoteCache, txBlockNumber: BlockNumber): Promise<TxEffect> {
  const txEffect = TxEffect.empty();

  noteCache.finish();

  const nonceGenerator = noteCache.getNonceGenerator();
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

  txEffect.txHash = new TxHash(new Fr(txBlockNumber));

  return txEffect;
}
