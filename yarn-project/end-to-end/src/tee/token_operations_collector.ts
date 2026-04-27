import { ARCHIVE_HEIGHT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import type { Tuple } from '@aztec/foundation/serialize';
import { MembershipWitness } from '@aztec/foundation/trees';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { BlockHeader, OffchainEffect, TxHash } from '@aztec/stdlib/tx';

import { extractMetadata } from './da_extractors.js';
import type { GrumpkinPoseidonSignature } from './grumpkin_schnorr.js';
import { produceAncestorEffectsHints } from './produce_ancestor_effects_hints.js';
import type { DepositClaim, NoteData, OutboxExit, SpendValidationData, TokenOperation } from './signer.js';

const NULLIFICATION_EFFECT_TYPE = 1;
const INSERTION_EFFECT_TYPE = 2;

// NullificationEffect serialization layout (from effects.nr):
//   [0] typ (u8), [1] amount (u128), [2] owner (AztecAddress), [3] randomness (Field),
//   [4] storage_slot (Field), [5] proven_note_hash (Field), [6] metadata.stage (u8),
//   [7] metadata.maybe_note_nonce (Field),
//   [8..12] signature (s_lo, s_hi, e_lo, e_hi)
const NULLIFICATION_EFFECT_LEN = 12;

// InsertionEffect serialization layout (from effects.nr):
//   [0] typ (u8), [1] amount (u128), [2] owner (AztecAddress), [3] randomness (Field),
//   [4] storage_slot (Field)
const INSERTION_EFFECT_LEN = 5;

export interface NullificationEffectData {
  amount: Fr;
  owner: AztecAddress;
  randomness: Fr;
  storageSlot: Fr;
  provenNoteHash: Fr;
  metadataStage: number;
  metadataMaybeNoteNonce: Fr;
  signature: GrumpkinPoseidonSignature;
}

export interface InsertionEffectData {
  amount: Fr;
  owner: AztecAddress;
  randomness: Fr;
  storageSlot: Fr;
}

export interface CollectedTokenEffects {
  nullifiedNotes: NullificationEffectData[];
  createdNotes: NoteData[];
}

/**
 * Per-spend metadata the caller must supply to hydrate a nullified note into full SpendValidationData.
 * The signature is not here — it comes from the NullificationEffect itself.
 */
export interface SpendMetadata {
  creationTxHash: TxHash;
  ownerAddressPreimage: CompleteAddress;
  masterNullifierSecretKey: GrumpkinScalar;
}

function parseNullificationEffect(data: Fr[]): NullificationEffectData {
  if (data.length !== NULLIFICATION_EFFECT_LEN) {
    throw new Error(`Expected ${NULLIFICATION_EFFECT_LEN} fields for NullificationEffect, got ${data.length}`);
  }
  return {
    amount: data[1],
    owner: AztecAddress.fromField(data[2]),
    randomness: data[3],
    storageSlot: data[4],
    provenNoteHash: data[5],
    metadataStage: Number(data[6].toBigInt()),
    metadataMaybeNoteNonce: data[7],
    signature: {
      sLo: data[8],
      sHi: data[9],
      eLo: data[10],
      eHi: data[11],
    },
  };
}

function parseInsertionEffect(data: Fr[]): InsertionEffectData {
  if (data.length !== INSERTION_EFFECT_LEN) {
    throw new Error(`Expected ${INSERTION_EFFECT_LEN} fields for InsertionEffect, got ${data.length}`);
  }
  return {
    amount: data[1],
    owner: AztecAddress.fromField(data[2]),
    randomness: data[3],
    storageSlot: data[4],
  };
}

/**
 * Parses offchain effects for the given token contract into nullified and created note data.
 * Pure parsing — no node access, no hints. Squashing (future) can happen here.
 */
export function collectTokenEffects(
  tokenAddress: AztecAddress,
  offchainEffects: OffchainEffect[],
): CollectedTokenEffects {
  const nullifiedNotes: NullificationEffectData[] = [];
  const createdNotes: NoteData[] = [];

  for (const effect of offchainEffects) {
    if (!effect.contractAddress.equals(tokenAddress)) {
      continue;
    }
    if (effect.data.length === 0) {
      throw new Error('Empty offchain effect data');
    }

    const typ = Number(effect.data[0].toBigInt());
    switch (typ) {
      case NULLIFICATION_EFFECT_TYPE:
        nullifiedNotes.push(parseNullificationEffect(effect.data));
        break;
      case INSERTION_EFFECT_TYPE: {
        const insertion = parseInsertionEffect(effect.data);
        createdNotes.push({
          amount: insertion.amount,
          owner: insertion.owner,
          randomness: insertion.randomness,
        });
        break;
      }
      default:
        throw new Error(`Unknown effect type ${typ}`);
    }
  }

  // TODO: implement squashing

  return { nullifiedNotes, createdNotes };
}

/**
 * Hydrates collected effects into a full TokenOperation.
 *
 * For each nullified note, this looks up the creation tx's effects, produces ancestry hints against
 * the operation anchor block, extracts the note's anchor-block-hash from the creation metadata, and
 * fetches the archive membership witness needed to prove that anchor-block-hash is an ancestor of
 * the operation anchor block.
 *
 * `spendMetadata` MUST be in the same order and have the same length as `collected.nullifiedNotes`.
 */
export interface BridgeAssertions {
  deposits: DepositClaim[];
  exits: OutboxExit[];
}

export async function buildTokenOperation(
  node: AztecNode,
  anchorBlockHeader: BlockHeader,
  collected: CollectedTokenEffects,
  spendMetadata: SpendMetadata[],
  bridge?: BridgeAssertions,
): Promise<TokenOperation> {
  if (spendMetadata.length !== collected.nullifiedNotes.length) {
    throw new Error(
      `spendMetadata length ${spendMetadata.length} does not match nullifiedNotes length ${collected.nullifiedNotes.length}`,
    );
  }

  const anchorBlockHash = await anchorBlockHeader.hash();

  const spentNotes: SpendValidationData[] = await Promise.all(
    collected.nullifiedNotes.map(async (nullified, i) => {
      const metadata = spendMetadata[i];
      const { effects: creationEffects, hints } = await produceAncestorEffectsHints(
        node,
        metadata.creationTxHash,
        anchorBlockHash,
      );

      const creationMetadata = extractMetadata(creationEffects);

      // A block's own hash isn't in its own archive, so when the creation's anchor equals the
      // operation's anchor, no real witness exists. The signer short-circuits on equality and
      // never consults the witness, so we stuff in a zero-filled placeholder in that case.
      const anchorBlockHashMembershipWitness = creationMetadata.anchorBlockHash.equals(anchorBlockHash)
        ? new MembershipWitness<typeof ARCHIVE_HEIGHT>(
            ARCHIVE_HEIGHT,
            0n,
            Array(ARCHIVE_HEIGHT).fill(Fr.zero()) as Tuple<Fr, typeof ARCHIVE_HEIGHT>,
          )
        : await node.getBlockHashMembershipWitness(anchorBlockHash, creationMetadata.anchorBlockHash);
      if (!anchorBlockHashMembershipWitness) {
        throw new Error(
          `Creation anchor block ${creationMetadata.anchorBlockHash} is not an ancestor of operation anchor block ${anchorBlockHash}`,
        );
      }

      return {
        note: {
          amount: nullified.amount,
          owner: nullified.owner,
          randomness: nullified.randomness,
        },
        ownerAddressPreimage: metadata.ownerAddressPreimage,
        masterNullifierSecretKey: metadata.masterNullifierSecretKey,
        creationEffects,
        hints,
        signature: nullified.signature,
        anchorBlockHashMembershipWitness,
      };
    }),
  );

  return {
    anchorBlockHeader,
    spentNotes,
    createdNotes: collected.createdNotes,
    deposits: bridge?.deposits ?? [],
    exits: bridge?.exits ?? [],
  };
}
