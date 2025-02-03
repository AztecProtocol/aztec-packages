import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { Fr } from '@aztec/foundation/fields';

import { Blob } from './blob.js';
import { TX_START_PREFIX, TX_START_PREFIX_BYTES_LENGTH } from './encoding.js';

// TODO: copied form circuit-types tx effect
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
