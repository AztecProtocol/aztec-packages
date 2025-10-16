import { Fr } from '@aztec/foundation/fields';

/**
 * Represents a compressed string stored as a field element in Aztec.nr contracts.
 * The string is encoded as a single bigint field value.
 */
interface NoirFieldCompressedString {
  /**
   * The field element value containing the compressed string data.
   */
  value: bigint;
}

/**
 * Decodes a field-compressed string back into its original string representation.
 * The function extracts bytes from the field element and converts them to characters,
 * stopping at null bytes.
 *
 * @param field - The NoirFieldCompressedString containing the compressed string data.
 * @returns The decoded string extracted from the field element.
 */
export const readFieldCompressedString = (field: NoirFieldCompressedString): string => {
  const vals: number[] = Array.from(new Fr(field.value).toBuffer());

  let str = '';
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] != 0) {
      str += String.fromCharCode(Number(vals[i]));
    }
  }
  return str;
};
