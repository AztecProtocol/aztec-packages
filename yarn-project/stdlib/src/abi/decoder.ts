import { Fr } from '@aztec/foundation/fields';

import { AztecAddress } from '../aztec-address/index.js';
import type { ABIParameter, ABIVariable, AbiType } from './abi.js';
import { isAztecAddressStruct, parseSignedInt } from './utils.js';

/**
 * The result type after decoding ABI-encoded field elements.
 *
 * Represents the possible TypeScript values that can result from decoding
 * circuit outputs or encoded function arguments. Supports:
 * - Primitive types: bigint, boolean, string
 * - Aztec types: AztecAddress
 * - Complex types: arrays and structs (objects with string keys)
 *
 * @remarks
 * Decoded values are TypeScript-native representations that can be used
 * directly in application code. Numeric values use `bigint` to preserve
 * the full field element range.
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
    if (this.types.length === 1) {
      return this.decodeNext(this.types[0]);
    }
    return this.types.map(type => this.decodeNext(type));
  }
}

/**
 * Decodes a flattened field element array into TypeScript values.
 *
 * Converts the flat Fr[] array output from circuits back into structured
 * TypeScript values based on the provided ABI types. This is the inverse
 * operation of `encodeArguments`.
 *
 * @param typ - Array of ABI types defining the expected structure
 * @param buffer - Flattened field array to decode
 * @returns Decoded TypeScript value(s)
 *
 * @remarks
 * The decoder:
 * - Consumes fields from the buffer in order
 * - Reconstructs complex types from their flattened representation
 * - Converts field elements to appropriate TypeScript types
 * - Returns a single value if one type, or an array if multiple types
 *
 * @example
 * ```typescript
 * // Decode simple return value
 * const types: AbiType[] = [{ kind: 'field' }];
 * const result = decodeFromAbi(types, [new Fr(42)]);
 * // result: 42n (bigint)
 *
 * // Decode struct return value
 * const types: AbiType[] = [{
 *   kind: 'struct',
 *   fields: [
 *     { name: 'x', type: { kind: 'field' } },
 *     { name: 'y', type: { kind: 'field' } }
 *   ]
 * }];
 * const result = decodeFromAbi(types, [new Fr(1), new Fr(2)]);
 * // result: { x: 1n, y: 2n }
 *
 * // Decode multiple return values
 * const types: AbiType[] = [
 *   { kind: 'field' },
 *   { kind: 'boolean' }
 * ];
 * const result = decodeFromAbi(types, [new Fr(42), new Fr(1)]);
 * // result: [42n, true]
 * ```
 */
export function decodeFromAbi(typ: AbiType[], buffer: Fr[]) {
  return new AbiDecoder(typ, buffer.slice()).decode();
}

/**
 * Generates human-readable function signatures from ABI definitions.
 *
 * Creates signature strings in Noir format from function names and parameters.
 * Used for:
 * - Computing function selectors
 * - Displaying function signatures to users
 * - Debugging and logging
 *
 * @remarks
 * Supports two modes:
 * - Compact: Type information only (for selector generation)
 * - Full: Includes parameter names (for display)
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
 * Generates a compact function signature for selector computation.
 *
 * Creates a signature string containing only type information, used for
 * computing function selectors. The format matches Noir's function signature
 * convention: `functionName(type1,type2,...)`.
 *
 * @param name - The function name
 * @param parameters - The function parameters from the ABI
 * @returns The compact signature string (e.g., "transfer(field,field)")
 *
 * @remarks
 * This signature format:
 * - Excludes parameter names
 * - Uses Noir type names (field, u8, bool, etc.)
 * - Has no spaces between parameters
 * - Is deterministic for selector generation
 *
 * @example
 * ```typescript
 * const params: ABIParameter[] = [
 *   { name: 'to', type: { kind: 'field' }, visibility: 'private' },
 *   { name: 'amount', type: { kind: 'integer', sign: 'unsigned', width: 64 },
 *     visibility: 'private' }
 * ];
 * const sig = decodeFunctionSignature('transfer', params);
 * // Returns: "transfer(field,u64)"
 * ```
 */
export function decodeFunctionSignature(name: string, parameters: ABIParameter[]) {
  return new FunctionSignatureDecoder(name, parameters).decode();
}

/**
 * Generates a human-readable function signature with parameter names.
 *
 * Creates a signature string that includes both type information and parameter
 * names, useful for displaying to users. Format: `functionName(name: type, ...)`.
 *
 * @param name - The function name
 * @param parameters - The function parameters from the ABI
 * @returns The full signature string (e.g., "transfer(to: field, amount: u64)")
 *
 * @remarks
 * This signature format:
 * - Includes parameter names for clarity
 * - Uses spaces after commas for readability
 * - Is NOT used for selector generation
 * - Is intended for UI display and documentation
 *
 * @example
 * ```typescript
 * const params: ABIParameter[] = [
 *   { name: 'to', type: { kind: 'field' }, visibility: 'private' },
 *   { name: 'amount', type: { kind: 'integer', sign: 'unsigned', width: 64 },
 *     visibility: 'private' }
 * ];
 * const sig = decodeFunctionSignatureWithParameterNames('transfer', params);
 * // Returns: "transfer(to: field, amount: u64)"
 * ```
 */
export function decodeFunctionSignatureWithParameterNames(name: string, parameters: ABIParameter[]) {
  return new FunctionSignatureDecoder(name, parameters, true).decode();
}
