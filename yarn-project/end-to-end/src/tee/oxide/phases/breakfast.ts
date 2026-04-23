import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeL1ToL2MessageNullifier, computeSecretHash } from '@aztec/stdlib/hash';
import { L1Actor, L1ToL2Message, L2Actor } from '@aztec/stdlib/messaging';

import { INBOX_TREE_HEIGHT, type L1Client, type L1Snapshot, type L2Client } from '../clients.js';
import { CONSTANT_SECRET, computeStealthRecipientHash, getClaimContentHash } from '../content_hash.js';
import { buildDepositDigest, hashBufferList, hashFrList, type TeeConfig } from '../digest.js';
import type { LocalSigner } from '../local_signer.js';
import { type NotePreimage, computeSiloedNoteHash } from '../note.js';
import { assertWitnessMatchesRoot } from './common.js';

export type BreakfastInput = {
  recipient: AztecAddress;
  amount: bigint;
  sharedSecret: Fr;
  // Caller-supplied until the provenance / wellformedness path provides the
  // real note material the TEE should bind to.
  noteRandomness: Fr;
  // Caller asserts where the claim sits in the L1 Inbox subtree (the global
  // `MessageSent.index`) and provides the sibling path (length =
  // `INBOX_TREE_HEIGHT`). The TEE recomputes the message hash from its own
  // inputs and verifies that `(messageHash, siblingPath, subtreeIndex)`
  // sha256-truncs to `Inbox.getRoot(checkpointNumber)`, deriving both
  // `checkpointNumber` and `subtreeIndex` from the global leaf index.
  // Verifying against the L1 root (not an L2-node-asserted root) is the
  // whole point: an untrusted L2 cannot forge inbox inclusion.
  messageLeafIndex: bigint;
  inboxSiblingPath: Buffer[];
};

export type BreakfastOutput = {
  l2BlockHash: Fr;
  depositDigest: Buffer;
  teeSig: Buffer;
  requiredNullifiers: Fr[];
  validNotes: Fr[];
  notesHash: Fr;
  exitsHash: Fr;
};

export type BreakfastDeps = {
  signer: LocalSigner;
  l1Client: L1Client;
  l2Client: L2Client;
  config: TeeConfig;
};

async function buildClaimMessage(config: TeeConfig, input: BreakfastInput): Promise<L1ToL2Message> {
  const recipientHash = computeStealthRecipientHash(
    input.sharedSecret,
    input.recipient,
    config.l1Portal,
    config.l1ChainId,
  );
  const content = getClaimContentHash(recipientHash, input.amount);
  const secretHash = await computeSecretHash(CONSTANT_SECRET);
  return new L1ToL2Message(
    new L1Actor(config.l1Portal, Number(config.l1ChainId)),
    new L2Actor(config.l2Bridge, Number(config.rollupVersion)),
    content,
    secretHash,
    new Fr(input.messageLeafIndex),
  );
}

async function verifyInboxWitness(
  snapshot: L1Snapshot,
  messageHash: Buffer,
  leafIndex: bigint,
  siblingPath: Buffer[],
): Promise<void> {
  const checkpointSize = 1n << BigInt(INBOX_TREE_HEIGHT);
  const checkpointNumber = 1n + leafIndex / checkpointSize;
  const subtreeIndex = leafIndex % checkpointSize;
  const actual = await snapshot.getInboxRoot(checkpointNumber);
  assertWitnessMatchesRoot(
    'inbox',
    `checkpoint ${checkpointNumber} at L1 block ${snapshot.number}`,
    subtreeIndex,
    messageHash,
    siblingPath,
    actual,
  );
}

export async function runBreakfast(deps: BreakfastDeps, input: BreakfastInput): Promise<BreakfastOutput> {
  const { config, l1Client, l2Client, signer } = deps;
  if (input.inboxSiblingPath.length !== INBOX_TREE_HEIGHT) {
    throw new Error(`inbox sibling path length ${input.inboxSiblingPath.length} != expected ${INBOX_TREE_HEIGHT}`);
  }

  const message = await buildClaimMessage(config, input);
  const messageHash = message.hash();
  const snapshot = await l1Client.freezeFinalized();
  await verifyInboxWitness(snapshot, messageHash.toBuffer(), input.messageLeafIndex, input.inboxSiblingPath);

  const messageNullifier = await computeL1ToL2MessageNullifier(config.l2Bridge, messageHash, CONSTANT_SECRET);
  // Best-effort preflight: if the claim nullifier is already on L2, refuse to
  // sign another deposit attestation for it. Under the current model the main
  // safety story is still canonical nullifier uniqueness plus the later
  // tx-effect binding checks in `evening`; this read just avoids wasting TEE
  // signatures on an already-spent claim.
  if (await l2Client.hasNullifier(messageNullifier)) {
    throw new Error(
      `claim message nullifier ${messageNullifier.toString()} already present on L2 - refusing to sign a replayed deposit`,
    );
  }

  const note: NotePreimage = {
    owner: input.recipient,
    amount: input.amount,
    randomness: input.noteRandomness,
  };
  // Siloed (not unique-siloed) so the attestation is position-independent.
  // Evening / future claim-side provenance binds the siloed hash back to
  // the tx's unique-siloed outputs via `(firstNullifier, indexInTx)` hints
  // at verify time.
  const siloedNote = await computeSiloedNoteHash(config.l2Bridge, note);

  const requiredNullifiers = [messageNullifier];
  const validNotes = [siloedNote];

  const l2BlockHash = await l2Client.getBlockHash();
  const depositDigest = buildDepositDigest({
    l2BlockHash,
    requiredNullifiers,
    validNotes,
    config,
  });
  const teeSig = signer.sign(depositDigest);

  return {
    l2BlockHash,
    depositDigest,
    teeSig,
    requiredNullifiers,
    validNotes,
    notesHash: hashFrList(validNotes),
    exitsHash: hashBufferList([]),
  };
}
