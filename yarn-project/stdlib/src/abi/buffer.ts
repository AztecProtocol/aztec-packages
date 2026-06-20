import { Fr } from '@aztec/foundation/curves/bn254';

import chunk from 'lodash.chunk';

/**
 * Formats a buffer as an array of fields. Splits the input into 31-byte chunks, and stores each
 * of them into a field, omitting the field's first byte, then adds zero-fields at the end until the max length.
 * @param input - Input to format.
 * @param targetLength - Length of the target array in number of fields.
 * @returns A field with the total length in bytes, followed by an array of fields such that their concatenation is equal to the input buffer, followed by enough zeroes to reach targetLength.
 */
export function bufferAsFields(input: Buffer, targetLength: number): Fr[] {
  const encoded = [
    new Fr(input.length),
    ...chunk(input, Fr.SIZE_IN_BYTES - 1).map(c => {
      const fieldBytes = Buffer.alloc(Fr.SIZE_IN_BYTES);
      Buffer.from(c).copy(fieldBytes, 1);
      return Fr.fromBuffer(fieldBytes);
    }),
  ];
  if (encoded.length > targetLength) {
    throw new Error(`Input buffer exceeds maximum size: got ${encoded.length} but max is ${targetLength}`);
  }
  // Fun fact: we cannot use padArrayEnd here since typescript cannot deal with a Tuple this big
  return [...encoded, ...Array(targetLength - encoded.length).fill(Fr.ZERO)];
}

/**
 * Recovers a buffer from an array of fields previously encoded with bufferAsFields.
 *
 * The first field encodes the byte length of the original buffer. The remaining fields
 * each carry 31 bytes of payload (the leading byte of each 32-byte field element is skipped).
 *
 * If the declared byte length exceeds the bytes available from the payload fields, the result
 * is zero-padded to the full declared length. This is important for correctness when the field
 * array has been truncated (e.g. contract class logs reconstructed from blobs using a short
 * emittedLength): without padding, the resulting buffer would be shorter than declared, causing
 * bytecode commitment computations to diverge from what the circuit produced.
 *
 * @param fields - An output from bufferAsFields: [byteLength, ...payloadFields].
 * @param maxByteLength - Optional upper bound on the declared byte length. When the field array comes
 *   from untrusted input (e.g. a gossiped contract-class log), pass the payload capacity so an
 *   attacker-declared length cannot force a large `Buffer.alloc` before the value is otherwise
 *   rejected. Throws if the declared length exceeds it, before allocating.
 * @returns A buffer of exactly `byteLength` bytes.
 */
export function bufferFromFields(fields: Fr[], maxByteLength?: number): Buffer {
  const [length, ...payload] = fields;
  const byteLength = length.toNumber();
  if (maxByteLength !== undefined && byteLength > maxByteLength) {
    throw new Error(`Declared byte length ${byteLength} exceeds maximum ${maxByteLength}`);
  }
  const raw = Buffer.concat(payload.map(f => f.toBuffer().subarray(1)));
  if (raw.length >= byteLength) {
    return raw.subarray(0, byteLength);
  }
  // Pad with zeros if the declared length exceeds the available payload bytes.
  // This ensures the returned buffer always matches the declared length, so that
  // downstream bytecode commitment computations are consistent even when the
  // source field array was truncated (e.g. reconstructed from blob with a short emittedLength).
  const result = Buffer.alloc(byteLength);
  raw.copy(result);
  return result;
}
