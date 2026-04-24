import { Fr, GrumpkinScalar, Point } from '@aztec/aztec.js/fields';
import { ARCHIVE_HEIGHT, DomainSeparator, L1_TO_L2_MSG_TREE_HEIGHT } from '@aztec/constants';
import { Buffer32 } from '@aztec/foundation/buffer';
import { padArrayEnd } from '@aztec/foundation/collection';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { sha256 } from '@aztec/foundation/crypto/sha256';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Tuple } from '@aztec/foundation/serialize';
import { type MembershipWitness, computeRootFromSiblingPath } from '@aztec/foundation/trees';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import {
  computeL1ToL2MessageNullifier,
  computeL2ToL1MessageHash,
  computeNoteHashNonce,
  computeUniqueNoteHash,
  siloNoteHash,
  siloNullifier,
} from '@aztec/stdlib/hash';
import { computeAddress, computeAppNullifierHidingKey, derivePublicKeyFromSecretKey } from '@aztec/stdlib/keys';
import { L1Actor, L1ToL2Message, L2Actor } from '@aztec/stdlib/messaging';
import type { BlockHeader, TxEffect } from '@aztec/stdlib/tx';

import {
  checkAncestorEffectsHints,
  checkAncestorEffectsHintsAtArchiveRoot,
  verifyArchiveMembership,
} from './check_ancestor_effects_hints.js';
import {
  extractExitMessageHashes,
  extractMetadata,
  extractRequiredNullifiers,
  extractTeeNotes,
} from './da_extractors.js';
import {
  type GrumpkinPoseidonSignature,
  generateGrumpkinKeypair,
  grumpkinSchnorrSign,
  grumpkinSchnorrVerify,
} from './grumpkin_schnorr.js';
import { computeStealthRecipientHash, getClaimContentHash, getWithdrawContentHash } from './oxide/content_hash.js';
import { buildWithdrawalFinalDigest } from './oxide/digest.js';
import {
  type AncestorEffectsHints,
  MAX_DEPOSITS,
  MAX_EFFECTS,
  MAX_EXITS,
  type TEEMetadata,
  TeeSigDomain,
  TeeSignedData,
} from './types.js';

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

/**
 * An L1 -> L2 deposit the TEE is asked to credit into a created note.
 *
 * `recipient`/`amount`/`sharedSecret` are the claim() preimage; the TEE rebuilds the
 * stealth recipient hash + claim content hash from them and proves the resulting
 * message hash was inserted into the inbox via membership in the L1->L2 message tree
 * rooted in the operation's anchor block header.
 */
export interface DepositClaim {
  recipient: AztecAddress;
  amount: bigint;
  sharedSecret: Fr;
  messageLeafIndex: bigint;
  siblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_TREE_HEIGHT>;
}

/**
 * An L2 -> L1 exit the TEE attests the operation emitted. The TEE derives the content
 * hash from (l1Recipient, amount) internally; callers only need to pass the preimage.
 */
export interface OutboxExit {
  l1Recipient: EthAddress;
  amount: bigint;
}

/**
 * Bridge identity bound into each deposit's inbox message hash and referenced by the
 * TEE when rebuilding claim/withdraw content hashes. Required whenever `TokenOperation`
 * carries non-empty `deposits` or `exits`.
 *
 * `constantSecret` is the L2-side preimage (typically `Fr.ZERO` for the oxide bridge);
 * `constantSecretHash = computeSecretHash(constantSecret)` is cached to avoid recomputing
 * per deposit. The TEE uses `constantSecret` to derive the claim nullifier that folds
 * into the signed `requiredNullifiers` preimage slot.
 */
export interface BridgeContext {
  l1Portal: EthAddress;
  l1ChainId: bigint;
  l2Bridge: AztecAddress;
  rollupVersion: bigint;
  constantSecret: Fr;
  constantSecretHash: Fr;
}

export interface TokenOperation {
  anchorBlockHeader: BlockHeader;
  tokenAddress: AztecAddress;
  spentNotes: SpendValidationData[];
  createdNotes: NoteData[];
  deposits: DepositClaim[];
  exits: OutboxExit[];
  bridgeContext?: BridgeContext;
}

/**
 * Output of `signTokenOperation`. Named so `signExitFinalization` can accept it
 * directly as `initiation` without the caller having to spread the fields.
 */
export interface SignTokenOperationOutput {
  signatures: GrumpkinPoseidonSignature[];
  exitSignatures: GrumpkinPoseidonSignature[];
  requiredNullifiers: Tuple<Fr, typeof MAX_EFFECTS>;
  teeNotes: Tuple<Fr, typeof MAX_EFFECTS>;
  exitMessageHashes: Tuple<Fr, typeof MAX_EXITS>;
}

/**
 * Input to `signExitFinalization`. The TEE recomputes the `TeeSignedData(EXIT, ...)`
 * preimage from `operation` + `initiation` so it can re-verify the Grumpkin Schnorr
 * sig it previously produced before wrapping it in an ECDSA attestation for L1.
 *
 * `archiveRoot` is the TEE's current L2-state anchor for L1 finalization. The TEE
 * verifies that the first-phase operation anchor block hash is a member of this
 * archive before signing it.
 *
 * `initiationEffects` and `initiationHints` prove that the first-phase DA tuple
 * was published by an L2 tx under the same `archiveRoot`. Without this,
 * finalization would only prove that the TEE can rebuild a previously signed
 * object, not that the object was committed into the rollup.
 */
export interface ExitFinalizationInput {
  operation: TokenOperation;
  exitIndex: number;
  initiation: SignTokenOperationOutput;
  initiationEffects: TxEffect;
  initiationHints: AncestorEffectsHints;
  archiveRoot: Fr;
  anchorBlockHashMembershipWitness: MembershipWitness<typeof ARCHIVE_HEIGHT>;
}

export interface ExitFinalizationOutput {
  /**
   * Opaque 32-byte nullifier key L1 uses via `$isWithdrawalSpent`. Derived as
   * `sha256(TeeSignedData(EXIT, ...).toFields())` so it is unique per
   * (operation, exitIndex) - the first TEE binding.
   */
  initiationDigest: Buffer;
  /** 32-byte outbox-leaf hash for the exit, same value L1 rebuilds from the withdraw params. */
  messageHash: Buffer;
  /** 32-byte ECDSA preimage hash `TEEPortal.withdraw` recomputes. */
  finalDigest: Buffer;
  /** 65-byte (r || s || v) ECDSA signature the portal recovers. */
  signature: Buffer;
}

export class TeeSigner {
  constructor(
    private readonly privateKey: GrumpkinScalar,
    public readonly publicKey: Point,
    private readonly ecdsaSigner: Secp256k1Signer,
  ) {}

  get ethAddress(): EthAddress {
    return this.ecdsaSigner.address;
  }

  static async random(): Promise<TeeSigner> {
    const { privateKey, publicKey } = await generateGrumpkinKeypair();
    return new TeeSigner(privateKey, publicKey, Secp256k1Signer.random());
  }

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
    domain: TeeSigDomain,
    tokenAddress: AztecAddress,
    signedCommitment: Fr,
    metadata: TEEMetadata,
    requiredNullifiers: Tuple<Fr, typeof MAX_EFFECTS>,
    teeNotes: Tuple<Fr, typeof MAX_EFFECTS>,
    exitMessageHashes: Tuple<Fr, typeof MAX_EXITS>,
  ): Promise<void> {
    const signedData = new TeeSignedData(
      domain,
      metadata.anchorBlockHash,
      tokenAddress,
      signedCommitment,
      requiredNullifiers,
      teeNotes,
      exitMessageHashes,
    );
    const publicKey = new Point(metadata.pubKeyX, metadata.pubKeyY, false);
    const ok = await grumpkinSchnorrVerify(publicKey, signature, signedData.toFields());
    if (!ok) {
      throw new Error(`Signature verification failed for signed commitment ${signedCommitment}`);
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

  private validateExitMessageHashesInL2ToL1Msgs(
    exitMessageHashes: Tuple<Fr, typeof MAX_EXITS>,
    creationEffects: TxEffect,
  ): void {
    for (const exitMessageHash of exitMessageHashes) {
      if (exitMessageHash.equals(Fr.zero())) {
        continue;
      }
      if (!creationEffects.l2ToL1Msgs.some(msg => msg.equals(exitMessageHash))) {
        throw new Error(`Attested exit message hash ${exitMessageHash} not found in creation tx l2ToL1Msgs`);
      }
    }
  }

  private validateTupleEquals(actual: readonly Fr[], expected: readonly Fr[], label: string): void {
    if (actual.length !== expected.length) {
      throw new Error(`${label} length ${actual.length} does not match expected length ${expected.length}`);
    }
    for (let i = 0; i < actual.length; i++) {
      if (!actual[i].equals(expected[i])) {
        throw new Error(`${label}[${i}] ${actual[i]} does not match expected ${expected[i]}`);
      }
    }
  }

  private async validateTeeNotesInEffects(
    teeNotes: Tuple<Fr, typeof MAX_EFFECTS>,
    initiationEffects: TxEffect,
  ): Promise<void> {
    for (const teeNote of teeNotes) {
      if (teeNote.equals(Fr.zero())) {
        continue;
      }
      await this.validateSiloedVsUniqueNoteHash(teeNote, initiationEffects);
    }
  }

  private async validateCommittedInitiation(input: ExitFinalizationInput, anchorBlockHash: BlockHash): Promise<void> {
    await checkAncestorEffectsHintsAtArchiveRoot(input.initiationEffects, input.initiationHints, input.archiveRoot);

    const metadata = extractMetadata(input.initiationEffects);
    if (!metadata.pubKeyX.equals(this.publicKey.x) || !metadata.pubKeyY.equals(this.publicKey.y)) {
      throw new Error('Committed initiation metadata does not match this TEE public key');
    }
    if (!metadata.anchorBlockHash.equals(anchorBlockHash)) {
      throw new Error(
        `Committed initiation anchor ${metadata.anchorBlockHash} does not match operation anchor ${anchorBlockHash}`,
      );
    }

    const requiredNullifiers = extractRequiredNullifiers(input.initiationEffects);
    const teeNotes = extractTeeNotes(input.initiationEffects);
    const exitMessageHashes = extractExitMessageHashes(input.initiationEffects);

    // These equality checks bind the API-level initiation object to the DA actually
    // published by the tx. The effect checks below then bind that DA to what the tx did.
    this.validateTupleEquals(requiredNullifiers, input.initiation.requiredNullifiers, 'requiredNullifiers');
    this.validateTupleEquals(teeNotes, input.initiation.teeNotes, 'teeNotes');
    this.validateTupleEquals(exitMessageHashes, input.initiation.exitMessageHashes, 'exitMessageHashes');

    this.validateRequiredNullifiers(requiredNullifiers, input.initiationEffects);
    await this.validateTeeNotesInEffects(teeNotes, input.initiationEffects);
    this.validateExitMessageHashesInL2ToL1Msgs(exitMessageHashes, input.initiationEffects);
  }

  /**
   * For each deposit, rebuild the L1->L2 message hash from the claim preimage + bridge
   * context, prove the message hash is a leaf in the l1ToL2MessageTree rooted in the
   * operation's anchor block header, and compute the matching claim nullifier. The
   * nullifier is folded into `requiredNullifiers` by `signTokenOperation` so the
   * existing TeeSignedData preimage already binds the signature to which specific
   * deposits the TEE attested (no preimage extension needed for deposits).
   */
  private async validateDeposits(
    operation: TokenOperation,
  ): Promise<{ depositClaimNullifiers: Fr[]; amountDeposited: bigint }> {
    if (operation.deposits.length === 0) {
      return { depositClaimNullifiers: [], amountDeposited: 0n };
    }
    if (operation.deposits.length > MAX_DEPOSITS) {
      throw new Error(`Too many deposits: got ${operation.deposits.length}, max ${MAX_DEPOSITS}`);
    }
    const bridge = operation.bridgeContext;
    if (!bridge) {
      throw new Error('TokenOperation.bridgeContext is required when deposits is non-empty');
    }

    const l1ToL2Root = operation.anchorBlockHeader.state.l1ToL2MessageTree.root;

    const depositClaimNullifiers: Fr[] = [];
    let amountDeposited = 0n;

    for (const deposit of operation.deposits) {
      const recipientHash = computeStealthRecipientHash(
        deposit.sharedSecret,
        deposit.recipient,
        bridge.l1Portal,
        bridge.l1ChainId,
      );
      const contentHash = getClaimContentHash(recipientHash, deposit.amount);

      const message = new L1ToL2Message(
        new L1Actor(bridge.l1Portal, Number(bridge.l1ChainId)),
        new L2Actor(bridge.l2Bridge, Number(bridge.rollupVersion)),
        contentHash,
        bridge.constantSecretHash,
        new Fr(deposit.messageLeafIndex),
      );
      const messageHash = message.hash();

      if (deposit.siblingPath.length !== L1_TO_L2_MSG_TREE_HEIGHT) {
        throw new Error(`deposit siblingPath length ${deposit.siblingPath.length} != ${L1_TO_L2_MSG_TREE_HEIGHT}`);
      }
      const computedRoot = await computeRootFromSiblingPath(
        messageHash.toBuffer(),
        deposit.siblingPath.map(f => f.toBuffer()),
        Number(deposit.messageLeafIndex),
      );
      if (!Fr.fromBuffer(computedRoot).equals(l1ToL2Root)) {
        throw new Error(`deposit message hash ${messageHash} not in l1ToL2MessageTree rooted at ${l1ToL2Root}`);
      }

      // Same nullifier the L2 claim() will emit when it consumes this message. Binding
      // it into the signed preimage via `requiredNullifiers` forces the tx to actually
      // consume this exact deposit - swapping in a different claim breaks signature
      // verification on the spend side (because `validateRequiredNullifiers` on the
      // creation tx will not find the swapped-in nullifier).
      const claimNullifier = await computeL1ToL2MessageNullifier(bridge.l2Bridge, messageHash, bridge.constantSecret);

      depositClaimNullifiers.push(claimNullifier);
      amountDeposited += deposit.amount;
    }

    return { depositClaimNullifiers, amountDeposited };
  }

  /**
   * For each exit, compute the full L2->L1 message hash that the tx would emit
   * (`l2Sender = bridge.l2Bridge`, `l1Recipient = bridge.l1Portal`, content built from
   * `(exit.l1Recipient, exit.amount)`). The caller asserts these hashes appear in the
   * creation tx's outgoing messages, which is how exits are bound to the signature
   * today - the TeeSignedData preimage does not yet carry an exit slot, so this
   * offchain check is the only thing tying the signed operation to the specific exits.
   */
  private validateExits(operation: TokenOperation): { exitMessageHashes: Fr[]; amountExited: bigint } {
    if (operation.exits.length === 0) {
      return { exitMessageHashes: [], amountExited: 0n };
    }
    if (operation.exits.length > MAX_EXITS) {
      throw new Error(`Too many exits: got ${operation.exits.length}, max ${MAX_EXITS}`);
    }
    const bridge = operation.bridgeContext;
    if (!bridge) {
      throw new Error('TokenOperation.bridgeContext is required when exits is non-empty');
    }

    const exitMessageHashes: Fr[] = [];
    let amountExited = 0n;
    for (const exit of operation.exits) {
      const content = getWithdrawContentHash(exit.l1Recipient, exit.amount);
      const messageHash = computeL2ToL1MessageHash({
        l2Sender: bridge.l2Bridge,
        l1Recipient: bridge.l1Portal,
        content,
        rollupVersion: new Fr(bridge.rollupVersion),
        chainId: new Fr(bridge.l1ChainId),
      });
      exitMessageHashes.push(messageHash);
      amountExited += exit.amount;
    }
    return { exitMessageHashes, amountExited };
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

      const creationExitMessageHashes = extractExitMessageHashes(spend.creationEffects);
      // We do the whole TEE dance because we can't fully trust the outbox - it inherits
      // trust from circuits that may be buggy. So independently verify that every exit
      // the TEE attested in the creation preimage actually shows up as an L2->L1 message
      // in the creation tx's effects. A rogue-or-broken TEE that signed a phantom exit
      // gets caught here, at the first spend of any note produced by that tx.
      this.validateExitMessageHashesInL2ToL1Msgs(creationExitMessageHashes, spend.creationEffects);

      const creationMetadata = extractMetadata(spend.creationEffects);
      //TODO: validate that the signer is registered on L1
      await this.validateSpendAnchorBlockHash(
        creationMetadata.anchorBlockHash,
        operation.anchorBlockHeader,
        spend.anchorBlockHashMembershipWitness,
      );

      await this.validateSignature(
        spend.signature,
        TeeSigDomain.NOTE,
        operation.tokenAddress,
        siloedNoteHash,
        creationMetadata,
        creationRequiredNullifiers,
        creationTeeNotes,
        creationExitMessageHashes,
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

  private async buildOperationCommitments(
    operation: TokenOperation,
    mintBypass: boolean,
  ): Promise<{
    anchorBlockHash: BlockHash;
    siloedNoteHashes: Fr[];
    exitMessageHashes: Fr[];
    requiredNullifiers: Tuple<Fr, typeof MAX_EFFECTS>;
    teeNotes: Tuple<Fr, typeof MAX_EFFECTS>;
    paddedExitMessageHashes: Tuple<Fr, typeof MAX_EXITS>;
  }> {
    const anchorBlockHash = await operation.anchorBlockHeader.hash();

    const { requiredNullifiers: spendNullifiers, amountSpent } = await this.validateSpends(operation, anchorBlockHash);
    const { depositClaimNullifiers, amountDeposited } = await this.validateDeposits(operation);
    const { exitMessageHashes, amountExited } = this.validateExits(operation);

    // Deposits bind into the signature via the existing `requiredNullifiers` preimage
    // slot - the claim nullifier is deterministic from the message hash, so including
    // it here ties the signature to the exact deposit the TEE attested.
    const requiredNullifiers = [...spendNullifiers, ...depositClaimNullifiers];

    const amountCreated = operation.createdNotes.reduce((acc, createdNote) => acc + createdNote.amount.toBigInt(), 0n);
    // Unified balance invariant: sum(spent) + sum(deposits) == sum(created) + sum(exits).
    // `mintBypass` only exists while pure mints (no deposit) are still around; once all
    // mint flows are replaced by deposits, this flag goes away.
    if (!mintBypass && amountSpent + amountDeposited !== amountCreated + amountExited) {
      throw new Error(
        `Balance mismatch: spent=${amountSpent} deposited=${amountDeposited} created=${amountCreated} exited=${amountExited}`,
      );
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

    const paddedRequiredNullifiers = padArrayEnd(requiredNullifiers, Fr.zero(), MAX_EFFECTS);
    const paddedTeeNotes = padArrayEnd(teeNotes, Fr.zero(), MAX_EFFECTS);
    const paddedExitMessageHashes = padArrayEnd(exitMessageHashes, Fr.zero(), MAX_EXITS);

    return {
      anchorBlockHash,
      siloedNoteHashes,
      exitMessageHashes,
      requiredNullifiers: paddedRequiredNullifiers,
      teeNotes: paddedTeeNotes,
      paddedExitMessageHashes,
    };
  }

  public async signTokenOperation(
    operation: TokenOperation,
    mintBypass: boolean, // If true, we will allow signing non matching values (for testing mint)
  ): Promise<SignTokenOperationOutput> {
    const commitments = await this.buildOperationCommitments(operation, mintBypass);

    // Every TEE attestation for this operation (one per created note, one per exit)
    // shares the same preimage tail (requiredNullifiers, teeNotes, exitMessageHashes),
    // differing in which specific commitment lives in the `signedCommitment` slot
    // and in the `domain` discriminator. Per-exit signatures are what TEEPortal
    // will verify at withdrawal-start time on L1 - together with outbox membership
    // of the message hash, they bind the exit to this exact operation.
    const buildSignedData = (domain: TeeSigDomain, signedCommitment: Fr) =>
      new TeeSignedData(
        domain,
        commitments.anchorBlockHash,
        operation.tokenAddress,
        signedCommitment,
        commitments.requiredNullifiers,
        commitments.teeNotes,
        commitments.paddedExitMessageHashes,
      );

    const signatures = await Promise.all(
      commitments.siloedNoteHashes.map(siloedNoteHash =>
        grumpkinSchnorrSign(
          this.privateKey,
          this.publicKey,
          buildSignedData(TeeSigDomain.NOTE, siloedNoteHash).toFields(),
        ),
      ),
    );

    const exitSignatures = await Promise.all(
      commitments.exitMessageHashes.map(exitMessageHash =>
        grumpkinSchnorrSign(
          this.privateKey,
          this.publicKey,
          buildSignedData(TeeSigDomain.EXIT, exitMessageHash).toFields(),
        ),
      ),
    );

    return {
      signatures,
      exitSignatures,
      requiredNullifiers: commitments.requiredNullifiers,
      teeNotes: commitments.teeNotes,
      exitMessageHashes: commitments.paddedExitMessageHashes,
    };
  }

  /**
   * Second-phase L1 attestation: wraps an earlier `signTokenOperation` exit sig in
   * an ECDSA signature consumed by `TEEPortal.withdraw`.
   *
   * The L1 finalization preimage is
   *   `domain(1) || archiveRoot(32) || initiationDigest(32) || messageHash(32)`
   * where `initiationDigest = sha256(TeeSignedData(EXIT, ...).toFields())` - i.e. the
   * hash of the exact preimage the first-phase Grumpkin Schnorr sig was computed over.
   * Binding that digest:
   *   - gives L1 a unique-per-(operation, exit) nullifier key for `$isWithdrawalSpent`
   *   - ties the L1 attestation to the first-phase TEE authorization, so a compromised
   *     second-phase TEE cannot produce a valid L1 sig for an exit the first TEE
   *     didn't authorize.
   *
   * This method does *not* verify outbox membership - that is L1's job via
   * `OUTBOX.consume`. It verifies only the things needed to produce a sound ECDSA sig:
   *   - `exitIndex` points at a real (non-zero-padded) exit in the signed preimage
   *   - the first-phase Grumpkin Schnorr sig over that preimage is valid under
   *     this signer's Grumpkin pubkey
   *   - the operation anchor block hash and exact first-phase DA tuple are committed
   *     under `archiveRoot`, and its required nullifiers / created notes / exits
   *     are present in that tx's effects.
   */
  public async signExitFinalization(input: ExitFinalizationInput): Promise<ExitFinalizationOutput> {
    if (input.exitIndex < 0 || input.exitIndex >= MAX_EXITS) {
      throw new Error(`exitIndex ${input.exitIndex} out of bounds [0, ${MAX_EXITS})`);
    }
    const exitMessageHash = input.initiation.exitMessageHashes[input.exitIndex];
    if (exitMessageHash.equals(Fr.zero())) {
      throw new Error(`exitIndex ${input.exitIndex} is a zero-padded slot; no exit to finalize`);
    }
    if (input.initiation.exitSignatures.length > MAX_EXITS) {
      throw new Error(
        `initiation.exitSignatures length ${input.initiation.exitSignatures.length} exceeds max ${MAX_EXITS}`,
      );
    }
    if (input.exitIndex >= input.initiation.exitSignatures.length) {
      throw new Error(
        `exitIndex ${input.exitIndex} has no matching exit signature; got ` +
          `${input.initiation.exitSignatures.length} signatures`,
      );
    }

    const commitments = await this.buildOperationCommitments(input.operation, false);
    this.validateTupleEquals(
      commitments.requiredNullifiers,
      input.initiation.requiredNullifiers,
      'operation requiredNullifiers',
    );
    this.validateTupleEquals(commitments.teeNotes, input.initiation.teeNotes, 'operation teeNotes');
    this.validateTupleEquals(
      commitments.paddedExitMessageHashes,
      input.initiation.exitMessageHashes,
      'operation exitMessageHashes',
    );
    await verifyArchiveMembership(
      commitments.anchorBlockHash.toBuffer(),
      input.anchorBlockHashMembershipWitness,
      input.archiveRoot,
      'operation anchor block',
    );
    await this.validateCommittedInitiation(input, commitments.anchorBlockHash);

    const preimage = new TeeSignedData(
      TeeSigDomain.EXIT,
      commitments.anchorBlockHash,
      input.operation.tokenAddress,
      exitMessageHash,
      input.initiation.requiredNullifiers,
      input.initiation.teeNotes,
      input.initiation.exitMessageHashes,
    );

    const exitSignature = input.initiation.exitSignatures[input.exitIndex];
    const ok = await grumpkinSchnorrVerify(this.publicKey, exitSignature, preimage.toFields());
    if (!ok) {
      throw new Error(`initiation exit signature at index ${input.exitIndex} failed Grumpkin Schnorr verification`);
    }

    const preimageBytes = Buffer.concat(preimage.toFields().map(f => f.toBuffer()));
    const initiationDigest = sha256(preimageBytes);
    const messageHash = exitMessageHash.toBuffer();

    const finalDigest = buildWithdrawalFinalDigest({
      archiveRoot: input.archiveRoot.toBuffer(),
      withdrawalDigest: initiationDigest,
      messageHash,
    });

    const ecdsa = this.ecdsaSigner.sign(Buffer32.fromBuffer(finalDigest));
    const signature = Buffer.concat([ecdsa.r.toBuffer(), ecdsa.s.toBuffer(), Buffer.from([ecdsa.v])]);

    return { initiationDigest, messageHash, finalDigest, signature };
  }
}
