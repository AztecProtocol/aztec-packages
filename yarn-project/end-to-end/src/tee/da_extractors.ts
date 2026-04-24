import { Fr } from '@aztec/aztec.js/fields';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import type { Tuple } from '@aztec/foundation/serialize';
import { BlockHash } from '@aztec/stdlib/block';
import type { TxEffect } from '@aztec/stdlib/tx';

import { MAX_EFFECTS, MAX_EXITS, TEEMetadata } from './types.js';

/** DA tags: must match those in `contracts/app/asserted_token_contract/src/da.nr`. */
const TEE_NOTES_DA_TAG = sha256ToField([Buffer.from('oxideTeeNotes')]);
const TEE_REQUIRED_NULLIFIERS_DA_TAG = sha256ToField([Buffer.from('oxideTeeRequiredNullifiers')]);
const TEE_METADATA_DA_TAG = sha256ToField([Buffer.from('oxideTeeMetadata')]);
const TEE_EXIT_MESSAGE_HASHES_DA_TAG = sha256ToField([Buffer.from('oxideTeeExitMessageHashes')]);

/** Layout of each private log carrying a DA component (mirrors da.nr):
 *   fields[0]: note tagging (unused here)
 *   fields[1]: DA tag
 *   fields[2..]: payload
 */
const DA_TAG_INDEX = 1;
const DA_PAYLOAD_OFFSET = 2;

const METADATA_SERIALIZED_LEN = 3;

/**
 * Finds the unique private log in `effect` tagged with `daTag`. Throws if zero or more than one
 * match is found, since we mirror the Noir contract's "exactly one" invariant.
 */
function findTaggedDaComponentIndex(effect: TxEffect, daTag: Fr): number {
  let count = 0;
  let index = -1;
  for (let i = 0; i < effect.privateLogs.length; i++) {
    if (effect.privateLogs[i].fields[DA_TAG_INDEX].equals(daTag)) {
      count += 1;
      index = i;
    }
  }
  if (count !== 1) {
    throw new Error(`Expected exactly one DA component tagged ${daTag}, found ${count}`);
  }
  return index;
}

/** Returns the MAX_EFFECTS-sized payload of the private log tagged as the TEE notes component. */
export function extractTeeNotes(effect: TxEffect): Tuple<Fr, typeof MAX_EFFECTS> {
  const index = findTaggedDaComponentIndex(effect, TEE_NOTES_DA_TAG);
  const fields = effect.privateLogs[index].fields;
  return fields.slice(DA_PAYLOAD_OFFSET, DA_PAYLOAD_OFFSET + MAX_EFFECTS) as Tuple<Fr, typeof MAX_EFFECTS>;
}

/** Returns the MAX_EFFECTS-sized payload of the private log tagged as the required-nullifiers component. */
export function extractRequiredNullifiers(effect: TxEffect): Tuple<Fr, typeof MAX_EFFECTS> {
  const index = findTaggedDaComponentIndex(effect, TEE_REQUIRED_NULLIFIERS_DA_TAG);
  const fields = effect.privateLogs[index].fields;
  return fields.slice(DA_PAYLOAD_OFFSET, DA_PAYLOAD_OFFSET + MAX_EFFECTS) as Tuple<Fr, typeof MAX_EFFECTS>;
}

/** Returns the MAX_EXITS-sized payload of the private log tagged as the exit message hashes component. */
export function extractExitMessageHashes(effect: TxEffect): Tuple<Fr, typeof MAX_EXITS> {
  const index = findTaggedDaComponentIndex(effect, TEE_EXIT_MESSAGE_HASHES_DA_TAG);
  const fields = effect.privateLogs[index].fields;
  return fields.slice(DA_PAYLOAD_OFFSET, DA_PAYLOAD_OFFSET + MAX_EXITS) as Tuple<Fr, typeof MAX_EXITS>;
}

/** Deserializes the TEEMetadata struct (pubKeyX, pubKeyY, anchorBlockHash) from the metadata log. */
export function extractMetadata(effect: TxEffect): TEEMetadata {
  const index = findTaggedDaComponentIndex(effect, TEE_METADATA_DA_TAG);
  const fields = effect.privateLogs[index].fields;
  const [pubKeyX, pubKeyY, anchorBlockHash] = fields.slice(
    DA_PAYLOAD_OFFSET,
    DA_PAYLOAD_OFFSET + METADATA_SERIALIZED_LEN,
  );
  return new TEEMetadata(pubKeyX, pubKeyY, new BlockHash(anchorBlockHash));
}
