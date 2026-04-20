import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockHeader, OffchainEffect } from '@aztec/stdlib/tx';

import type { TokenOperation } from './signer.js';

const NULLIFICATION_EFFECT_TYPE = 1;
const INSERTION_EFFECT_TYPE = 2;

// NullificationEffect serialization layout (from effects.nr):
//   [0] typ (u8), [1] amount (u128), [2] owner (AztecAddress), [3] randomness (Field),
//   [4] storage_slot (Field), [5] proven_note_hash (Field), [6] metadata.stage (u8),
//   [7] metadata.maybe_note_nonce (Field)
const NULLIFICATION_EFFECT_LEN = 8;

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
}

export interface InsertionEffectData {
  amount: Fr;
  owner: AztecAddress;
  randomness: Fr;
  storageSlot: Fr;
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

export async function collectTokenEffects(
  tokenAddress: AztecAddress,
  anchorBlockHeader: BlockHeader,
  offchainEffects: OffchainEffect[],
): Promise<TokenOperation> {
  const nullifications: NullificationEffectData[] = [];
  const insertions: InsertionEffectData[] = [];

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
        nullifications.push(parseNullificationEffect(effect.data));
        break;
      case INSERTION_EFFECT_TYPE:
        insertions.push(parseInsertionEffect(effect.data));
        break;
      default:
        throw new Error(`Unknown effect type ${typ}`);
    }
  }

  return {
    anchorBlockHash: await anchorBlockHeader.hash(),
    tokenAddress,
    spentNotes: [], // TODO
    createdNotes: insertions.map(insertion => ({
      amount: insertion.amount,
      owner: insertion.owner,
      randomness: insertion.randomness,
    })),
  };
}
