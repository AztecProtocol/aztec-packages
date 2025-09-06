import { Fr } from '@aztec/foundation/fields';

function stringToField(str: string): Fr {
  let number = BigInt(str);
  if (number < 0) {
    number = Fr.MODULUS + number;
  }
  return new Fr(number);
}

function stringArrayToFields(arr: string[]): Fr[] {
  return arr.map(stringToField);
}

export { stringArrayToFields };
