import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';

import type { L1Client, L1Snapshot, L2Client, L2TxEffect, OxideBinding } from '../clients.js';
import {
  buildWithdrawalFinalDigest,
  buildWithdrawalInitDigest,
  hashBufferList,
  hashFrList,
  type TeeConfig,
} from '../digest.js';
import { LocalSigner } from '../local_signer.js';
import { computeUniqueFromSiloedNoteHash } from '../note.js';
import { assertWitnessMatchesRoot, computeExitMessageHash } from './common.js';

// Progressive toggles for checks that can't yet pass in an end-to-end
// sandbox run. Each defaults to `true`; set to `false` to downgrade the
// corresponding assertion to a `logger` warning. Flip back to `true` as
// the underlying gap closes (note-randomness workstream).
export type TeeStrictness = {
  // Asserts each `requiredNullifier` is present in the tx effect.
  // Disabled while the credited note's randomness is derived internally
  // by the L2 contract and the TEE's caller-supplied randomness can't
  // reproduce it.
  txNullifiersPresent?: boolean;
  // Asserts each `validNote` is present in the tx effect. Same rationale
  // as `txNullifiersPresent`.
  txNotesPresent?: boolean;
};

export type TeeLogger = (message: string) => void;

export type EveningInput = {
  l1Recipient: EthAddress;
  exitAmount: bigint;
  // Caller must pass the exact digest afternoon signed over. The TEE
  // recomputes the expected digest from the other evening inputs, refuses
  // to sign if they disagree, then uses the reconstructed digest for
  // signer recovery - so the final signature binds to the specific
  // withdrawal the tx-effect checks validate.
  withdrawalDigest: Buffer;
  // Afternoon's 65-byte ECDSA signature over `withdrawalDigest`. Evening
  // recovers the signer and requires membership in the L1 TeeRegistry at
  // the finalized block.
  initiationTeeSig: Buffer;
  // Approved siloed-nullifier and siloed-note sets from afternoon; evening
  // re-checks these against the L2 tx effect before producing the final
  // signature.
  requiredNullifiers: Fr[];
  validNotes: Fr[];
  // Hints (one per `validNotes` entry) letting evening derive each note's
  // unique-siloed hash from its siloed hash + first nullifier + in-tx
  // position, so the tx-notes-presence check stays hard even with siloed-
  // only attestation.
  validNoteIndicesInTx: number[];
  // The tx's designated first nullifier (seeds note-hash uniqueness).
  // Evening asserts it is actually present in the tx's nullifier set.
  firstNullifier: Fr;
  initiationL2BlockHash: Fr;
  txHash: Fr;
  // Caller asserts which outbox leaf the exit landed in and provides the
  // sibling path. The TEE reconstructs the root from the exit message
  // hash it independently computes and verifies it against the L1 root
  // for the asserted epoch. Mirrors the breakfast inbox pattern - the
  // caller picks the leaf, the TEE proves it.
  outboxEpochNumber: bigint;
  outboxLeafIndex: bigint;
  outboxSiblingPath: Buffer[];
};

export type EveningOutput = {
  signature: Buffer;
  finalDigest: Buffer;
  l1BlockNumber: bigint;
  epochNumber: bigint;
  leafIndex: bigint;
};

export type EveningDeps = {
  signer: LocalSigner;
  l1Client: L1Client;
  l2Client: L2Client;
  config: TeeConfig;
  strict: Required<TeeStrictness>;
  log: TeeLogger;
};

// In-tx uniqueness is derived off the tx-level first nullifier, which by
// Aztec protocol convention is `txEffect.nullifiers[0]`. Require the
// caller's hint to equal that exact slot, not merely be present somewhere
// in the set - otherwise a caller could pick a different nullifier and
// only fail via the unique-derivation check, which is strictness-gated
// for the randomness-gap workstream.
function assertFirstNullifier(txEffect: L2TxEffect, txHash: Fr, hint: Fr): void {
  const first = txEffect.nullifiers[0];
  if (first === undefined) {
    throw new Error(`tx ${txHash.toString()} has no nullifiers; cannot derive unique notes`);
  }
  if (!first.equals(hint)) {
    throw new Error(
      `firstNullifier hint ${hint.toString()} does not match tx ${txHash.toString()} first nullifier ${first.toString()}`,
    );
  }
}

function assertRequiredNullifiersPresent(
  txEffect: L2TxEffect,
  required: Fr[],
  txHash: Fr,
  strict: boolean,
  log: TeeLogger,
): void {
  const present = new Set(txEffect.nullifiers.map(n => n.toString()));
  for (const nullifier of required) {
    if (present.has(nullifier.toString())) {
      continue;
    }
    const msg = `required nullifier ${nullifier.toString()} missing from tx ${txHash.toString()}`;
    if (strict) {
      throw new Error(msg);
    }
    log(`[strictness.txNullifiersPresent=false] ${msg}`);
  }
}

// `validNotes` are siloed; tx.notes are unique-siloed. For each claimed
// siloed hash, derive the unique at the caller-hinted position and require
// it appear in tx.notes. `firstNullifier` is pinned by `assertFirstNullifier`
// upstream, so the caller cannot steer the derivation. `indexInTx` is a
// caller hint that only passes when it matches the position the L2 circuit
// actually chose.
async function assertValidNotesPresent(
  txEffect: L2TxEffect,
  validNotes: Fr[],
  indicesInTx: number[],
  firstNullifier: Fr,
  txHash: Fr,
  strict: boolean,
  log: TeeLogger,
): Promise<void> {
  const present = new Set(txEffect.notes.map(n => n.toString()));
  for (let i = 0; i < validNotes.length; i++) {
    const siloed = validNotes[i]!;
    const indexInTx = indicesInTx[i]!;
    const derivedUnique = await computeUniqueFromSiloedNoteHash(siloed, firstNullifier, indexInTx);
    if (present.has(derivedUnique.toString())) {
      continue;
    }
    const msg = `siloed note ${siloed.toString()} at indexInTx=${indexInTx} derived unique ${derivedUnique.toString()} missing from tx ${txHash.toString()}`;
    if (strict) {
      throw new Error(msg);
    }
    log(`[strictness.txNotesPresent=false] ${msg}`);
  }
}

function assertSingleBindingMatches(bindings: OxideBinding[], expectedNotesHash: Fr, expectedExitsHash: Fr): void {
  if (bindings.length !== 1) {
    throw new Error(`expected exactly 1 OxideBinding public log, got ${bindings.length}`);
  }
  const [binding] = bindings;
  if (!binding.notesHash.equals(expectedNotesHash)) {
    throw new Error(
      `OxideBinding notesHash mismatch: binding=${binding.notesHash.toString()} expected=${expectedNotesHash.toString()}`,
    );
  }
  if (!binding.exitsHash.equals(expectedExitsHash)) {
    throw new Error(
      `OxideBinding exitsHash mismatch: binding=${binding.exitsHash.toString()} expected=${expectedExitsHash.toString()}`,
    );
  }
}

async function recoverRegisteredSigner(digest: Buffer, signature: Buffer, snapshot: L1Snapshot): Promise<void> {
  const recovered = LocalSigner.recover(digest, signature);
  if (recovered === undefined) {
    throw new Error(`initiation TEE signature is not recoverable`);
  }
  if (!(await snapshot.isRegisteredTee(recovered))) {
    throw new Error(
      `initiation TEE signer 0x${recovered.toString('hex')} is not registered at L1 block ${snapshot.number}`,
    );
  }
}

async function verifyOutboxWitness(
  snapshot: L1Snapshot,
  epochNumber: bigint,
  leafIndex: bigint,
  siblingPath: Buffer[],
  messageHash: Buffer,
): Promise<void> {
  if (siblingPath.length === 0) {
    throw new Error(`outboxSiblingPath must be non-empty`);
  }
  const actual = await snapshot.getOutboxRoot(epochNumber);
  assertWitnessMatchesRoot('outbox', `epoch ${epochNumber}`, leafIndex, messageHash, siblingPath, actual);
}

export async function runEvening(deps: EveningDeps, input: EveningInput): Promise<EveningOutput> {
  const { config, l1Client, l2Client, signer, strict, log } = deps;
  if (input.validNoteIndicesInTx.length !== input.validNotes.length) {
    throw new Error(
      `validNoteIndicesInTx length ${input.validNoteIndicesInTx.length} != validNotes length ${input.validNotes.length}`,
    );
  }

  const messageHash = computeExitMessageHash(config, input.l1Recipient, input.exitAmount);
  const validExits = [messageHash];

  const txEffect = await l2Client.getTxEffect(input.txHash);
  if (!(await l2Client.isAncestor(input.initiationL2BlockHash, txEffect.blockHash))) {
    throw new Error(
      `initiation L2 block ${input.initiationL2BlockHash.toString()} is not an ancestor of tx block ${txEffect.blockHash.toString()}`,
    );
  }

  assertFirstNullifier(txEffect, input.txHash, input.firstNullifier);
  assertRequiredNullifiersPresent(txEffect, input.requiredNullifiers, input.txHash, strict.txNullifiersPresent, log);
  await assertValidNotesPresent(
    txEffect,
    input.validNotes,
    input.validNoteIndicesInTx,
    input.firstNullifier,
    input.txHash,
    strict.txNotesPresent,
    log,
  );
  assertSingleBindingMatches(txEffect.oxideBindings, hashFrList(input.validNotes), hashBufferList(validExits));

  // Rebuild the afternoon digest from tx-pinned inputs and use *that* for
  // signer recovery. Trusting the caller's `withdrawalDigest` here would
  // let caller+sig collude; reconstructing from inputs already bound to
  // on-chain state breaks that. Constraint audit per field:
  //   - `l2BlockHash`: caller-supplied; sig-bound. Hard-bound to the tx's
  //     canonical block via the `isAncestor` check above.
  //   - `requiredNullifiers`: caller-supplied; sig-bound. Cross-checked
  //     against `txEffect.nullifiers`, but strictness-gated for the
  //     randomness-gap workstream.
  //   - `validNotes`: caller-supplied; sig-bound. Hard-bound to
  //     `binding.notesHash` above, and (strictness-gated) to derived
  //     uniques in `txEffect.notes`.
  //   - `validExits`: derived from `(l1Recipient, exitAmount, config)`;
  //     hard-bound to `binding.exitsHash` above.
  //   - `config`: constant for this TEE instance.
  const reconstructedDigest = buildWithdrawalInitDigest({
    l2BlockHash: input.initiationL2BlockHash,
    requiredNullifiers: input.requiredNullifiers,
    validNotes: input.validNotes,
    validExits,
    config,
  });
  if (!reconstructedDigest.equals(input.withdrawalDigest)) {
    throw new Error(
      `withdrawalDigest mismatch: caller=0x${input.withdrawalDigest.toString('hex')} recomputed=0x${reconstructedDigest.toString('hex')}`,
    );
  }

  if (await l1Client.isWithdrawalSpent(reconstructedDigest)) {
    throw new Error(`withdrawal digest 0x${reconstructedDigest.toString('hex')} is already spent on TEEPortal`);
  }

  // Freeze the L1 snapshot only after the latest-state replay preflight
  // passes. The spent check is just an economic skip; registry membership,
  // outbox root verification, and the final digest stay pinned to finalized
  // L1 state.
  const snapshot = await l1Client.freezeFinalized();
  await recoverRegisteredSigner(reconstructedDigest, input.initiationTeeSig, snapshot);

  // Looking up the outbox leaf by `messageHash` would be last-wins - two
  // withdrawals with the same `(recipient, amount)` produce the same
  // message hash and a hash-keyed index can't tell them apart. Caller
  // picks `(epoch, leafIndex)`, TEE reconstructs.
  await verifyOutboxWitness(snapshot, input.outboxEpochNumber, input.outboxLeafIndex, input.outboxSiblingPath, messageHash);

  const finalDigest = buildWithdrawalFinalDigest({
    withdrawalDigest: input.withdrawalDigest,
    l1BlockNumber: snapshot.number,
    l1BlockHash: snapshot.hash,
    messageHash,
    epochNumber: input.outboxEpochNumber,
    leafIndex: input.outboxLeafIndex,
    config,
  });
  const signature = signer.sign(finalDigest);

  return {
    signature,
    finalDigest,
    l1BlockNumber: snapshot.number,
    epochNumber: input.outboxEpochNumber,
    leafIndex: input.outboxLeafIndex,
  };
}
