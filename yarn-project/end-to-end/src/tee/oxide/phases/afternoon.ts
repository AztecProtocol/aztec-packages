import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';

import type { L2Client } from '../clients.js';
import { buildWithdrawalInitDigest, hashBufferList, hashFrList, type TeeConfig } from '../digest.js';
import type { LocalSigner } from '../local_signer.js';
import { type NotePreimage, computeSiloedNoteHash, computeSiloedNullifier } from '../note.js';
import { computeExitMessageHash } from './common.js';

export type AfternoonInput = {
  notesToExit: NotePreimage[];
  changeNote: NotePreimage | null;
  nskM: Fr;
  l1Recipient: EthAddress;
  exitAmount: bigint;
};

export type AfternoonOutput = {
  l2BlockHash: Fr;
  withdrawalDigest: Buffer;
  teeSig: Buffer;
  requiredNullifiers: Fr[];
  validNotes: Fr[];
  notesHash: Fr;
  exitsHash: Fr;
};

export type AfternoonDeps = {
  signer: LocalSigner;
  l2Client: L2Client;
  config: TeeConfig;
};

export async function runAfternoon(deps: AfternoonDeps, input: AfternoonInput): Promise<AfternoonOutput> {
  const { config, l2Client, signer } = deps;

  // TODO(afternoon-note-provenance): `notesToExit`, `changeNote`, and
  // `nskM` are trusted blindly today. A caller can hand us any preimage
  // and we will sign over a withdrawal that spends it. Before this leaves
  // Phase 5 we need, per `notesToExit` entry:
  //   - a creation tx hash + witness,
  //   - pull that tx effect, reconstruct its `OxideBinding` from the
  //     siloed note hash + nullifiers and verify the breakfast (or
  //     prior afternoon) TEE signature over that binding,
  //   - confirm the derived siloed nullifier is not already present on
  //     L2 (`l2Client.hasNullifier` on the siloed form).
  // That chains afternoon back to a known-honest prior phase and blocks
  // the caller from fabricating a preimage for a note that was never
  // credited to them.
  const requiredNullifiers: Fr[] = [];
  let inAmount = 0n;
  for (const note of input.notesToExit) {
    requiredNullifiers.push(await computeSiloedNullifier(config.l2Bridge, note, input.nskM));
    inAmount += note.amount;
  }
  const changeAmount = input.changeNote?.amount ?? 0n;
  const outAmount = changeAmount + input.exitAmount;
  if (inAmount !== outAmount) {
    throw new Error(`value conservation failed: in=${inAmount} out=${outAmount}`);
  }

  const validNotes: Fr[] = [];
  if (input.changeNote !== null) {
    if (requiredNullifiers.length === 0) {
      throw new Error('cannot emit a change note without spending at least one note');
    }
    validNotes.push(await computeSiloedNoteHash(config.l2Bridge, input.changeNote));
  }

  const validExits = [computeExitMessageHash(config, input.l1Recipient, input.exitAmount)];
  const l2BlockHash = await l2Client.getBlockHash();
  const withdrawalDigest = buildWithdrawalInitDigest({
    l2BlockHash,
    requiredNullifiers,
    validNotes,
    validExits,
    config,
  });
  const teeSig = signer.sign(withdrawalDigest);

  return {
    l2BlockHash,
    withdrawalDigest,
    teeSig,
    requiredNullifiers,
    validNotes,
    notesHash: hashFrList(validNotes),
    exitsHash: hashBufferList(validExits),
  };
}
