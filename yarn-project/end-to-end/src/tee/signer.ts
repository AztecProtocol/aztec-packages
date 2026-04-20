import { Fr, GrumpkinScalar, Point } from '@aztec/aztec.js/fields';
import { DomainSeparator } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import type { Tuple } from '@aztec/foundation/serialize';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockHash } from '@aztec/stdlib/block';
import { siloNoteHash } from '@aztec/stdlib/hash';

import { type GrumpkinPoseidonSignature, grumpkinSchnorrSign } from './grumpkin_schnorr.js';
import { MAX_EFFECTS, TeeSignedData } from './types.js';

const BALANCES_STORAGE_SLOT = 3;

export interface SpentNoteData {}

export interface CreatedNoteData {
  amount: Fr;
  owner: AztecAddress;
  randomness: Fr;
}

export interface TokenOperation {
  anchorBlockHash: BlockHash;
  tokenAddress: AztecAddress;
  spentNotes: SpentNoteData[];
  createdNotes: CreatedNoteData[];
}

export class TeeSigner {
  constructor(
    private readonly privateKey: GrumpkinScalar,
    public readonly publicKey: Point,
  ) {}

  public async signTokenOperation(operation: TokenOperation): Promise<{
    signatures: GrumpkinPoseidonSignature[];
    requiredNullifiers: Tuple<Fr, typeof MAX_EFFECTS>;
    teeNotes: Tuple<Fr, typeof MAX_EFFECTS>;
  }> {
    const requiredNullifiers: Fr[] = [];
    // TODO: Validate the token operation
    const siloedNoteHashes = await Promise.all(
      operation.createdNotes.map(async createdNote => {
        const innerNoteHash = await poseidon2HashWithSeparator(
          [createdNote.amount, createdNote.owner, BALANCES_STORAGE_SLOT, createdNote.randomness],
          DomainSeparator.NOTE_HASH,
        );
        return siloNoteHash(operation.tokenAddress, innerNoteHash);
      }),
    );

    // TODO: add unrelated notes
    const teeNotes = siloedNoteHashes.slice();

    const dataToSign = siloedNoteHashes.map(siloedNoteHash => {
      return new TeeSignedData(
        operation.anchorBlockHash,
        operation.tokenAddress,
        siloedNoteHash,
        padArrayEnd(requiredNullifiers, Fr.zero(), MAX_EFFECTS),
        padArrayEnd(teeNotes, Fr.zero(), MAX_EFFECTS),
      );
    });

    const signatures = await Promise.all(
      dataToSign.map(data => grumpkinSchnorrSign(this.privateKey, this.publicKey, data.toFields())),
    );

    return {
      signatures,
      requiredNullifiers: padArrayEnd(requiredNullifiers, Fr.zero(), MAX_EFFECTS),
      teeNotes: padArrayEnd(teeNotes, Fr.zero(), MAX_EFFECTS),
    };
  }
}
