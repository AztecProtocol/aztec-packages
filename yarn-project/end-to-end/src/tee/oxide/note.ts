import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeNoteHashNonce, computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';

// Models the `UintNote` fields held by `BalanceSet`. `randomness` is where the
// off-chain / on-chain mismatch lives today - the TEE can only compute the note
// hash if it chose the randomness itself, or if the randomness is derivable from
// public data. That scheme is being resolved in a parallel workstream; for
// Phase 5 the caller supplies `randomness` directly.
export type NotePreimage = {
  owner: AztecAddress;
  amount: bigint;
  randomness: Fr;
};

function amountBe32(amount: bigint): Buffer {
  if (amount < 0n) {
    throw new Error(`non-negative required, got ${amount}`);
  }
  const buf = Buffer.alloc(32);
  let v = amount;
  for (let i = 31; i >= 0; i--) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) {
    throw new Error(`amount ${amount} overflows u256`);
  }
  return buf;
}

// Phase 5 stub: the real `UintNote` hash derivation lives in the `uint-note`
// aztec-nr crate. Only this function needs to change when we pick it up on the
// TS side - the rest of the TEE class composes through `siloNoteHash` etc.
export function rawNoteHash(note: NotePreimage): Fr {
  return sha256ToField([note.owner.toBuffer(), amountBe32(note.amount), note.randomness.toBuffer()]);
}

// Phase 5 stub: Aztec derives `nsk_app` per-contract from `nsk_m` via the key
// registry, then hashes `(note_hash, nsk_app)`. Wire the real derivation in
// alongside `rawNoteHash`.
export function innerNullifier(note: NotePreimage, nskM: Fr): Fr {
  return sha256ToField([rawNoteHash(note).toBuffer(), nskM.toBuffer()]);
}

export function computeSiloedNoteHash(contract: AztecAddress, note: NotePreimage): Promise<Fr> {
  return siloNoteHash(contract, rawNoteHash(note));
}

export async function computeUniqueFromSiloedNoteHash(
  siloed: Fr,
  firstNullifier: Fr,
  indexInTx: number,
): Promise<Fr> {
  const nonce = await computeNoteHashNonce(firstNullifier, indexInTx);
  return computeUniqueNoteHash(nonce, siloed);
}

export async function computeUniqueSiloedNoteHash(
  contract: AztecAddress,
  note: NotePreimage,
  firstNullifier: Fr,
  indexInTx: number,
): Promise<Fr> {
  const siloed = await computeSiloedNoteHash(contract, note);
  return computeUniqueFromSiloedNoteHash(siloed, firstNullifier, indexInTx);
}

export function computeSiloedNullifier(contract: AztecAddress, note: NotePreimage, nskM: Fr): Promise<Fr> {
  return siloNullifier(contract, innerNullifier(note, nskM));
}
