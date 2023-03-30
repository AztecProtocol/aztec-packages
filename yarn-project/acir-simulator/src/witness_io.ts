import { ACVMField, ACVMWitness, fromACVMField, toACVMField } from './acvm.js';
import { AztecAddress, EthAddress, Fr } from '@aztec/circuits.js';
import { select_return_flattened as selectPublicWitnessFlattened } from '@noir-lang/noir_util_wasm';

export class WitnessReader {
  private publicInputs: ACVMField[];

  constructor(witness: ACVMWitness, acir: Buffer) {
    this.publicInputs = selectPublicWitnessFlattened(acir, witness);
  }

  public readField(): Fr {
    return fromACVMField(this.publicInputs.shift()!);
  }

  public readFieldArray(length: number): Fr[] {
    const array: Fr[] = [];
    for (let i = 0; i < length; i++) {
      array.push(this.readField());
    }
    return array;
  }
}

export class WitnessWriter {
  constructor(private currentIndex: number, private witness: ACVMWitness) {}

  public writeField(field: Parameters<typeof toACVMField>[0]) {
    this.witness.set(this.currentIndex, toACVMField(field));
    this.currentIndex += 1;
  }

  public writeFieldArray(array: Fr[]) {
    for (const field of array) {
      this.writeField(field);
    }
  }

  public jump(amount: number) {
    this.currentIndex += amount;
  }
}

export function frToAztecAddress(fr: Fr): AztecAddress {
  return new AztecAddress(fr.toBuffer());
}

export function frToEthAddress(fr: Fr): EthAddress {
  return new EthAddress(fr.toBuffer().slice(-EthAddress.SIZE_IN_BYTES));
}

export function frToBoolean(fr: Fr): boolean {
  const buf = fr.toBuffer();
  return buf[buf.length - 1] !== 0;
}
