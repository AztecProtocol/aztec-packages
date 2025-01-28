import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { type EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';

import { type ACVMField } from './acvm_types.js';

/**
 * Adapts the buffer to the field size.
 * @param originalBuf - The buffer to adapt.
 * @returns The adapted buffer.
 */
function adaptBufferSize(originalBuf: Buffer) {
  const buffer = Buffer.alloc(Fr.SIZE_IN_BYTES);
  if (originalBuf.length > buffer.length) {
    throw new Error('Buffer does not fit in field');
  }
  originalBuf.copy(buffer, buffer.length - originalBuf.length);
  return buffer;
}

/**
 * Converts a value to an ACVM field.
 * @param value - The value to convert.
 * @returns The ACVM field.
 */
export function toACVMField(
  value: AztecAddress | EthAddress | Fr | Buffer | boolean | number | bigint | ACVMField,
): ACVMField {
  let buffer;
  if (Buffer.isBuffer(value)) {
    buffer = value;
  } else if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'bigint') {
    buffer = new Fr(value).toBuffer();
  } else if (typeof value === 'string') {
    buffer = Fr.fromHexString(value).toBuffer();
  } else {
    buffer = value.toBuffer();
  }
  return `0x${adaptBufferSize(buffer).toString('hex')}`;
}

/**
 * Inserts a list of ACVM fields to a witness.
 * @param witnessStartIndex - The index where to start inserting the fields.
 * @param fields - The fields to insert.
 * @returns The witness.
 */
export function toACVMWitness(witnessStartIndex: number, fields: Parameters<typeof toACVMField>[0][]) {
  return fields.reduce((witness, field, index) => {
    witness.set(index + witnessStartIndex, toACVMField(field));
    return witness;
  }, new Map<number, ACVMField>());
}

/**
 * Converts a Ts Fr array into a Noir BoundedVec of Fields. Note that BoundedVecs are structs, and therefore translated
 * as two separate ACVMField arrays.
 *
 * @param values The array with the field elements
 * @param maxLength The maximum number of elements in the Noir BoundedVec. `values` must have a length smaller or equal
 * to this.
 * @returns The elements of the Noir BoundedVec.
 */
export function toACVMBoundedVec(values: Fr[], maxLength: number): { storage: ACVMField[]; len: ACVMField } {
  if (values.length > maxLength) {
    throw new Error(
      `Cannot convert an array of length ${values.length} into a BoundedVec of maximum length ${maxLength}`,
    );
  }

  return {
    storage: values.map(toACVMField).concat(Array(maxLength - values.length).fill(toACVMField(0))),
    len: toACVMField(values.length),
  };
}
