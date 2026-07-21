import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';

import { AztecAddress } from '../aztec-address/index.js';
import type { AbiType } from './abi.js';
import { FunctionSelector } from './function_selector.js';
import {
  isAztecAddressStruct,
  isEthAddressStruct,
  isFunctionSelectorStruct,
  isOptionStruct,
  isWrappedFieldStruct,
  parseSignedInt,
} from './utils.js';

/**
 * The type of our decoded ABI.
 */
export type AbiDecoded =
  | bigint
  | boolean
  | string
  | AztecAddress
  | EthAddress
  | FunctionSelector
  | Fr
  | AbiDecoded[]
  | { [key: string]: AbiDecoded }
  | undefined;

/**
 * Decodes values using a provided ABI.
 */
class AbiDecoder {
  constructor(
    private types: AbiType[],
    private flattened: Fr[],
  ) {}

  /**
   * Decodes a single return value from field to the given type.
   * @param abiType - The type of the return value.
   * @returns The decoded return value.
   */
  private decodeNext(abiType: AbiType): AbiDecoded {
    switch (abiType.kind) {
      case 'field':
        return this.getNextField().toBigInt();
      case 'integer': {
        const nextField = this.getNextField();

        if (abiType.sign === 'signed') {
          // We parse the buffer using 2's complement
          return parseSignedInt(nextField.toBuffer(), abiType.width);
        }

        return nextField.toBigInt();
      }
      case 'boolean':
        return !this.getNextField().isZero();
      case 'array': {
        const array = [];
        for (let i = 0; i < abiType.length; i += 1) {
          array.push(this.decodeNext(abiType.type));
        }
        return array;
      }
      case 'struct': {
        const struct: { [key: string]: AbiDecoded } = {};
        if (isAztecAddressStruct(abiType)) {
          return new AztecAddress(this.getNextField().toBuffer());
        }
        if (isEthAddressStruct(abiType)) {
          return EthAddress.fromField(this.getNextField());
        }
        if (isFunctionSelectorStruct(abiType)) {
          return FunctionSelector.fromField(this.getNextField());
        }
        if (isWrappedFieldStruct(abiType)) {
          return this.getNextField();
        }
        if (isOptionStruct(abiType)) {
          const isSome = this.decodeNext(abiType.fields[0].type);
          const value = this.decodeNext(abiType.fields[1].type);
          return isSome ? value : undefined;
        }

        for (const field of abiType.fields) {
          struct[field.name] = this.decodeNext(field.type);
        }
        return struct;
      }
      case 'string': {
        let str = '';
        for (let i = 0; i < abiType.length; i += 1) {
          const charCode = Number(this.getNextField().toBigInt());
          str += String.fromCharCode(charCode);
        }
        return str;
      }
      case 'tuple': {
        const array = [];
        for (const tupleAbiType of abiType.fields) {
          array.push(this.decodeNext(tupleAbiType));
        }
        return array;
      }
      default:
        throw new Error(`Unsupported type: ${abiType}`);
    }
  }

  /**
   * Gets the next field in the flattened buffer.
   * @returns The next field in the flattened buffer.
   */
  private getNextField(): Fr {
    const field = this.flattened.shift();
    if (!field) {
      throw new Error('Not enough return values');
    }
    return field;
  }

  /**
   * Decodes all the values for the given ABI.
   * The decided value can be simple types, structs or arrays
   * @returns The decoded return values.
   */
  public decode(): AbiDecoded {
    if (this.types.length === 1) {
      return this.decodeNext(this.types[0]);
    }
    return this.types.map(type => this.decodeNext(type));
  }
}

/**
 * Decodes values in a flattened Field array using a provided ABI.
 * @param abi - The ABI to use as reference.
 * @param buffer - The flattened Field array to decode.
 * @returns
 */
export function decodeFromAbi(typ: AbiType[], buffer: Fr[]) {
  return new AbiDecoder(typ, buffer.slice()).decode();
}
