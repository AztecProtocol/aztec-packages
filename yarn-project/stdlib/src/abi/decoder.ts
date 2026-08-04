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
  constructor(private flattened: Fr[]) {}

  /**
   * Decodes a single value from field to the given type.
   * @param abiType - The type of the value.
   * @returns The decoded value.
   */
  public decodeNext(abiType: AbiType): AbiDecoded {
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
}

/**
 * Decodes the single value a function returns, or undefined if it returns nothing. Multiple return values are expressed
 * as one `tuple` type, so they decode through here too.
 * @param type - The type the function returns.
 * @param buffer - The flattened Field array to decode.
 */
export function decodeFromAbi(type: AbiType | undefined, buffer: Fr[]): AbiDecoded {
  return type === undefined ? undefined : new AbiDecoder(buffer.slice()).decodeNext(type);
}

/**
 * Decodes one value per given type, consumed from the buffer in order. Always returns one decoded value per type, so
 * callers can index the result positionally. A function's arguments are encoded this way.
 * @param types - The type of each value, in order.
 * @param buffer - The flattened Field array to decode.
 */
export function decodeEachFromAbi(types: AbiType[], buffer: Fr[]): AbiDecoded[] {
  const decoder = new AbiDecoder(buffer.slice());
  return types.map(type => decoder.decodeNext(type));
}
