import { Fr } from '@aztec/foundation/fields';

import { AztecAddress } from '../aztec-address/index.js';
import type { ABIParameter, ABIVariable, AbiType } from './abi.js';
import { isAztecAddressStruct, parseSignedInt } from './utils.js';

/**
 * The type of our decoded ABI.
 */
export type AbiDecoded = bigint | boolean | string | AztecAddress | AbiDecoded[] | { [key: string]: AbiDecoded };

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
    if (this.types.length > 1) {
      throw new Error('Multiple types not supported');
    }
    if (this.types.length === 0) {
      return [];
    }
    return this.decodeNext(this.types[0]);
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

/**
 * Decodes the signature of a function from the name and parameters.
 */
export class FunctionSignatureDecoder {
  private separator: string;
  constructor(
    private name: string,
    private parameters: ABIParameter[],
    private includeNames = false,
  ) {
    this.separator = includeNames ? ', ' : ',';
  }

  /**
   * Decodes a single function parameter type for the function signature.
   * @param param - The parameter type to decode.
   * @returns A string representing the parameter type.
   */
  private getParameterType(param: AbiType): string {
    switch (param.kind) {
      case 'field':
        return 'Field';
      case 'integer':
        if (param.sign === 'signed') {
          throw new Error('Unsupported type: signed integer');
        }
        return `u${param.width}`;
      case 'boolean':
        return 'bool';
      case 'array':
        return `[${this.getParameterType(param.type)};${param.length}]`;
      case 'string':
        return `str<${param.length}>`;
      case 'struct':
        return `(${param.fields.map(field => `${this.decodeParameter(field)}`).join(this.separator)})`;
      default:
        throw new Error(`Unsupported type: ${param.kind}`);
    }
  }

  /**
   * Decodes a single function parameter for the function signature.
   * @param param - The parameter to decode.
   * @returns A string representing the parameter type and optionally its name.
   */
  private decodeParameter(param: ABIVariable): string {
    const type = this.getParameterType(param.type);
    return this.includeNames ? `${param.name}: ${type}` : type;
  }

  /**
   * Decodes all the parameters and build the function signature
   * @returns The function signature.
   */
  public decode(): string {
    return `${this.name}(${this.parameters.map(param => this.decodeParameter(param)).join(this.separator)})`;
  }
}

/**
 * Decodes a function signature from the name and parameters.
 * @param name - The name of the function.
 * @param parameters - The parameters of the function.
 * @returns - The function signature.
 */
export function decodeFunctionSignature(name: string, parameters: ABIParameter[]) {
  return new FunctionSignatureDecoder(name, parameters).decode();
}

/**
 * Decodes a function signature from the name and parameters including parameter names.
 * @param name - The name of the function.
 * @param parameters - The parameters of the function.
 * @returns - The user-friendly function signature.
 */
export function decodeFunctionSignatureWithParameterNames(name: string, parameters: ABIParameter[]) {
  return new FunctionSignatureDecoder(name, parameters, true).decode();
}
