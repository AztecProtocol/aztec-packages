import { Fr, GrumpkinScalar, Point } from '@aztec/aztec.js/fields';
import { ARCHIVE_HEIGHT, DomainSeparator } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import type { Tuple } from '@aztec/foundation/serialize';
import { type MembershipWitness, computeRootFromSiblingPath } from '@aztec/foundation/trees';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockHash } from '@aztec/stdlib/block';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import { computeNoteHashNonce, computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import { computeAddress, computeAppNullifierHidingKey, derivePublicKeyFromSecretKey } from '@aztec/stdlib/keys';
import type { BlockHeader, TxEffect } from '@aztec/stdlib/tx';

import { checkAncestorEffectsHints } from './check_ancestor_effects_hints.js';
import { extractMetadata, extractRequiredNullifiers, extractTeeNotes } from './da_extractors.js';
import { type GrumpkinPoseidonSignature, grumpkinSchnorrSign, grumpkinSchnorrVerify } from './grumpkin_schnorr.js';
import { type AncestorEffectsHints, MAX_EFFECTS, type TEEMetadata, TeeSignedData } from './types.js';

const BALANCES_STORAGE_SLOT = 3;

export interface NoteData {
  amount: Fr;
  owner: AztecAddress;
  randomness: Fr;
}

export interface SpendValidationData {
  note: NoteData;
  ownerAddressPreimage: CompleteAddress;
  masterNullifierSecretKey: GrumpkinScalar;
  creationEffects: TxEffect;
  hints: AncestorEffectsHints;
  signature: GrumpkinPoseidonSignature;
  anchorBlockHashMembershipWitness: MembershipWitness<typeof ARCHIVE_HEIGHT>;
}

export interface TokenOperation {
  anchorBlockHeader: BlockHeader;
  tokenAddress: AztecAddress;
  spentNotes: SpendValidationData[];
  createdNotes: NoteData[];
}

export class TeeSigner {
  constructor(
    private readonly privateKey: GrumpkinScalar,
    public readonly publicKey: Point,
  ) {}

  private async validateOwnerPreimage(owner: AztecAddress, ownerAddressPreimage: CompleteAddress): Promise<void> {
    const derivedOwner = await computeAddress(ownerAddressPreimage.publicKeys, ownerAddressPreimage.partialAddress);
    if (!derivedOwner.equals(owner)) {
      throw new Error(`Owner address preimage does not match note owner: expected ${owner}, rederived ${derivedOwner}`);
    }
  }

  private async validateMasterNullifierSecretKey(
    masterNullifierSecretKey: GrumpkinScalar,
    ownerAddressPreimage: CompleteAddress,
  ): Promise<void> {
    const derivedNpk = await derivePublicKeyFromSecretKey(masterNullifierSecretKey);
    const committedNpk = ownerAddressPreimage.publicKeys.masterNullifierPublicKey;
    if (!derivedNpk.equals(committedNpk)) {
      throw new Error(
        `Master nullifier secret key does not match the npk_m committed to by ${ownerAddressPreimage.publicKeys.masterNullifierPublicKey}`,
      );
    }
  }

  private async validateSignature(
    signature: GrumpkinPoseidonSignature,
    tokenAddress: AztecAddress,
    siloedNoteHash: Fr,
    metadata: TEEMetadata,
    requiredNullifiers: Tuple<Fr, typeof MAX_EFFECTS>,
    teeNotes: Tuple<Fr, typeof MAX_EFFECTS>,
  ): Promise<void> {
    const signedData = new TeeSignedData(
      metadata.anchorBlockHash,
      tokenAddress,
      siloedNoteHash,
      requiredNullifiers,
      teeNotes,
    );
    const publicKey = new Point(metadata.pubKeyX, metadata.pubKeyY, false);
    const ok = await grumpkinSchnorrVerify(publicKey, signature, signedData.toFields());
    if (!ok) {
      throw new Error(`Signature verification failed for siloed note hash ${siloedNoteHash}`);
    }
  }

  /**
   * Mirrors validate_anchor_block_hash_in_the_past: the spend's anchor block hash must either
   * equal the operation's anchor block header hash, or be a leaf in that header's archive
   * (i.e. a strictly earlier block).
   */
  private async validateSpendAnchorBlockHash(
    spendAnchorBlockHash: BlockHash,
    operationAnchorBlockHeader: BlockHeader,
    membershipWitness: MembershipWitness<typeof ARCHIVE_HEIGHT>,
  ): Promise<void> {
    const operationAnchorHash = await operationAnchorBlockHeader.hash();
    if (operationAnchorHash.equals(spendAnchorBlockHash)) {
      return;
    }
    const { leafIndex, siblingPath } = membershipWitness;
    const computedRoot = await computeRootFromSiblingPath(
      spendAnchorBlockHash.toBuffer(),
      siblingPath.map(f => f.toBuffer()),
      Number(leafIndex),
    );
    const expectedRoot = operationAnchorBlockHeader.lastArchive.root;
    if (!Fr.fromBuffer(computedRoot).equals(expectedRoot)) {
      throw new Error(`Spend anchor block hash ${spendAnchorBlockHash} is not in the operation anchor block's archive`);
    }
  }

  private async validateSiloedVsUniqueNoteHash(siloedNoteHash: Fr, creationEffects: TxEffect): Promise<Fr> {
    const firstNullifier = creationEffects.nullifiers[0];
    let foundUniqueNoteHash = undefined;
    for (let i = 0; i < creationEffects.noteHashes.length; i++) {
      const nonceForI = await computeNoteHashNonce(firstNullifier, i);
      const uniqueNoteHash = await computeUniqueNoteHash(nonceForI, siloedNoteHash);
      if (uniqueNoteHash.equals(creationEffects.noteHashes[i])) {
        if (foundUniqueNoteHash !== undefined) {
          throw new Error(`Multiple unique note hashes found for siloed note hash ${siloedNoteHash}`);
        }
        foundUniqueNoteHash = uniqueNoteHash;
      }
    }

    if (foundUniqueNoteHash === undefined) {
      throw new Error(`Unique note hash not found for siloed note hash ${siloedNoteHash}`);
    }

    return foundUniqueNoteHash;
  }

  private validateRequiredNullifiers(
    requiredNullifiers: Tuple<Fr, typeof MAX_EFFECTS>,
    creationEffects: TxEffect,
  ): void {
    for (const requiredNullifier of requiredNullifiers) {
      if (requiredNullifier.equals(Fr.zero())) {
        continue;
      }
      if (!creationEffects.nullifiers.some(effectedNullifier => effectedNullifier.equals(requiredNullifier))) {
        throw new Error(`Required nullifier ${requiredNullifier} not found in creation effects`);
      }
    }
  }

  private validateSiloedNoteHashInTeeNotes(siloedNoteHash: Fr, teeNotes: Tuple<Fr, typeof MAX_EFFECTS>): void {
    if (teeNotes.filter(teeNote => teeNote.equals(siloedNoteHash)).length !== 1) {
      throw new Error(`Siloed note hash ${siloedNoteHash} not found once in tee notes`);
    }
  }

  private async validateSpends(
    operation: TokenOperation,
    anchorBlockHash: BlockHash,
  ): Promise<{
    requiredNullifiers: Fr[];
    amountSpent: bigint;
  }> {
    const localNullifierSet = new Set<bigint>();
    const requiredNullifiers: Fr[] = [];
    let amountSpent = 0n;

    for (const spend of operation.spentNotes) {
      // Validate the owner preimage we got
      await this.validateOwnerPreimage(spend.note.owner, spend.ownerAddressPreimage);
      // Validate that the master nullifier secret key matches the one in the owner address
      await this.validateMasterNullifierSecretKey(spend.masterNullifierSecretKey, spend.ownerAddressPreimage);

      const innerNoteHash = await poseidon2HashWithSeparator(
        [spend.note.amount, spend.note.owner, BALANCES_STORAGE_SLOT, spend.note.randomness],
        DomainSeparator.NOTE_HASH,
      );
      const siloedNoteHash = await siloNoteHash(operation.tokenAddress, innerNoteHash);

      // Check that the effects passed in existed
      await checkAncestorEffectsHints(spend.creationEffects, spend.hints, anchorBlockHash);

      const uniqueNoteHash = await this.validateSiloedVsUniqueNoteHash(siloedNoteHash, spend.creationEffects);

      const creationTeeNotes = extractTeeNotes(spend.creationEffects);
      this.validateSiloedNoteHashInTeeNotes(siloedNoteHash, creationTeeNotes);

      const creationRequiredNullifiers = extractRequiredNullifiers(spend.creationEffects);
      this.validateRequiredNullifiers(creationRequiredNullifiers, spend.creationEffects);

      const creationMetadata = extractMetadata(spend.creationEffects);
      //TODO: validate that the signer is registered on L1
      await this.validateSpendAnchorBlockHash(
        creationMetadata.anchorBlockHash,
        operation.anchorBlockHeader,
        spend.anchorBlockHashMembershipWitness,
      );

      await this.validateSignature(
        spend.signature,
        operation.tokenAddress,
        siloedNoteHash,
        creationMetadata,
        creationRequiredNullifiers,
        creationTeeNotes,
      );

      const appNsk = await computeAppNullifierHidingKey(spend.masterNullifierSecretKey, operation.tokenAddress);
      const innerNullifier = await poseidon2HashWithSeparator([uniqueNoteHash, appNsk], DomainSeparator.NOTE_NULLIFIER);
      const nullifier = await siloNullifier(operation.tokenAddress, innerNullifier);

      // Guard against spending the same note twice within this operation.
      if (localNullifierSet.has(nullifier.toBigInt())) {
        throw new Error(`Duplicate spend nullifier ${nullifier} in operation`);
      }
      localNullifierSet.add(nullifier.toBigInt());

      requiredNullifiers.push(nullifier);
      amountSpent += spend.note.amount.toBigInt();
    }

    return { requiredNullifiers, amountSpent };
  }

  public async signTokenOperation(
    operation: TokenOperation,
    mintBypass: boolean, // If true, we will allow signing non matching values (for testing mint)
  ): Promise<{
    signatures: GrumpkinPoseidonSignature[];
    requiredNullifiers: Tuple<Fr, typeof MAX_EFFECTS>;
    teeNotes: Tuple<Fr, typeof MAX_EFFECTS>;
  }> {
    const anchorBlockHash = await operation.anchorBlockHeader.hash();

    const { requiredNullifiers, amountSpent } = await this.validateSpends(operation, anchorBlockHash);

    const amountCreated = operation.createdNotes.reduce((acc, createdNote) => acc + createdNote.amount.toBigInt(), 0n);
    if (!mintBypass && amountCreated !== amountSpent) {
      throw new Error(`Amount created ${amountCreated} does not match amount spent ${amountSpent}`);
    }

    const siloedNoteHashes = await Promise.all(
      operation.createdNotes.map(async createdNote => {
        const innerNoteHash = await poseidon2HashWithSeparator(
          [createdNote.amount, createdNote.owner, BALANCES_STORAGE_SLOT, createdNote.randomness],
          DomainSeparator.NOTE_HASH,
        );
        return siloNoteHash(operation.tokenAddress, innerNoteHash);
      }),
    );

    // TODO: Do multiple token address operations in one go, running the tee once per tx.
    // For now tee notes are just the siloed note hashes of one token.
    const teeNotes = siloedNoteHashes.slice();
    if (new Set(teeNotes.map(teeNote => teeNote.toBigInt())).size !== teeNotes.length) {
      throw new Error(`Duplicate tee notes found in operation`);
    }

    const dataToSign = siloedNoteHashes.map(siloedNoteHash => {
      return new TeeSignedData(
        anchorBlockHash,
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
