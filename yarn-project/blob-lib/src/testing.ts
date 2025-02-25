import { BLOBS_PER_BLOCK } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { Fr } from '@aztec/foundation/fields';

import { Blob } from './blob.js';
import { BlobPublicInputs, BlockBlobPublicInputs } from './blob_public_inputs.js';
import { TX_START_PREFIX, TX_START_PREFIX_BYTES_LENGTH } from './encoding.js';
import { Poseidon2Sponge, SpongeBlob } from './sponge_blob.js';

/**
 * Makes arbitrary poseidon sponge for blob inputs.
 * Note: will not verify inside the circuit.
 * @param seed - The seed to use for generating the sponge.
 * @returns A sponge blob instance.
 */
export function makeSpongeBlob(seed = 1): SpongeBlob {
  return new SpongeBlob(
    new Poseidon2Sponge(
      makeTuple(3, i => new Fr(i)),
      makeTuple(4, i => new Fr(i)),
      1,
      false,
    ),
    seed,
    seed + 1,
  );
}

/**
 * Makes arbitrary blob public inputs.
 * Note: will not verify inside the circuit.
 * @param seed - The seed to use for generating the blob inputs.
 * @returns A blob public inputs instance.
 */
export function makeBlobPublicInputs(seed = 1): BlobPublicInputs {
  return new BlobPublicInputs(
    new Fr(seed),
    BigInt(seed + 1),
    makeTuple(2, i => new Fr(i)),
  );
}

/**
 * Makes arbitrary block blob public inputs.
 * Note: will not verify inside the circuit.
 * @param seed - The seed to use for generating the blob inputs.
 * @returns A block blob public inputs instance.
 */
export function makeBlockBlobPublicInputs(seed = 1): BlockBlobPublicInputs {
  return new BlockBlobPublicInputs(makeTuple(BLOBS_PER_BLOCK, () => makeBlobPublicInputs(seed)));
}

// TODO: copied form circuits.js tx effect
function encodeFirstField(length: number): Fr {
  const lengthBuf = Buffer.alloc(2);
  lengthBuf.writeUInt16BE(length, 0);
  return new Fr(
    Buffer.concat([
      toBufferBE(TX_START_PREFIX, TX_START_PREFIX_BYTES_LENGTH),
      Buffer.alloc(1),
      lengthBuf,
      Buffer.alloc(1),
      Buffer.from([1]),
      Buffer.alloc(1),
      Buffer.alloc(1),
    ]),
  );
}

/**
 * Make an encoded blob with the given length
 *
 * This will deserialise correctly in the archiver
 * @param length
 * @returns
 */
export function makeEncodedBlob(length: number): Promise<Blob> {
  return Blob.fromFields([encodeFirstField(length + 1), ...Array.from({ length: length }, () => Fr.random())]);
}

/**
 * Make an unencoded blob with the given length
 *
 * This will fail deserialisation in the archiver
 * @param length
 * @returns
 */
export function makeUnencodedBlob(length: number): Promise<Blob> {
  return Blob.fromFields([...Array.from({ length: length }, () => Fr.random())]);
}

export function makeEncodedBlobFields(fields: Fr[]): Promise<Blob> {
  return Blob.fromFields([encodeFirstField(fields.length + 1), ...fields]);
}
