import { Fr } from '@aztec/circuits.js';

/**
 * The representation of a FieldCompressedString in aztec.nr
 */
interface NoirFieldCompressedString {
  /**
   * The field value of the string
   */
  value: bigint;
}
/**
 * This turns
 * @param field - The field that contains the string
 * @returns - the string that is decoded from the field
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
