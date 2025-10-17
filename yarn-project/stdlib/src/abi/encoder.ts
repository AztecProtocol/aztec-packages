import { Fr } from '@aztec/foundation/fields';

import type { AbiType, FunctionAbi } from './abi.js';
import { isAddressStruct, isBoundedVecStruct, isFunctionSelectorStruct, isWrappedFieldStruct } from './utils.js';

/**
 * Encodes TypeScript/JavaScript arguments into field elements for circuit execution.
 *
 * This class handles the conversion of high-level types (numbers, strings, objects, arrays)
 * into the flat array of field elements that Noir circuits expect. It supports:
 * - Primitive types: field, boolean, integer
 * - Complex types: arrays, structs, tuples, strings
 * - Special Aztec types: addresses, selectors, BoundedVec
 *
 * @remarks
 * The encoder flattens all arguments into a single Fr[] array. Noir circuits expect
 * arguments in this flattened format, with structs and arrays expanded into their
 * constituent fields in a specific order.
 *
 * @example
 * ```typescript
 * const abi: FunctionAbi = {
 *   name: 'transfer',
 *   parameters: [
 *     { name: 'to', type: { kind: 'field' }, visibility: 'private' },
 *     { name: 'amount', type: { kind: 'field' }, visibility: 'private' }
 *   ],
 *   // ... other properties
 * };
 *
 * // Encode arguments
 * const args = [recipient.toField(), new Fr(100)];
 * const encoded = encodeArguments(abi, args);
 * // Result: Fr[] with each argument as a field element
 * ```
 */
class ArgumentEncoder {
  private flattened: Fr[] = [];

  constructor(
    private abi: FunctionAbi,
    private args: any[],
  ) {}

  static typeSize(abiType: AbiType): number {
    switch (abiType.kind) {
      case 'field':
      case 'boolean':
      case 'integer':
        return 1;
      case 'string':
        return abiType.length;
      case 'array':
        return abiType.length * ArgumentEncoder.typeSize(abiType.type);
      case 'struct':
        return abiType.fields.reduce((acc, field) => acc + ArgumentEncoder.typeSize(field.type), 0);
      case 'tuple':
        return abiType.fields.reduce((acc, field) => acc + ArgumentEncoder.typeSize(field), 0);
      default: {
        const exhaustiveCheck: never = abiType;
        throw new Error(`Unhandled abi type: ${exhaustiveCheck}`);
      }
    }
  }

  /**
   * Encodes a single argument from the given type to field.
   * @param abiType - The abi type of the argument.
   * @param arg - The value to encode.
   * @param name - Name.
   */
  private encodeArgument(abiType: AbiType, arg: any, name?: string) {
    if (arg === undefined || arg == null) {
      throw new Error(`Undefined argument ${name ?? 'unnamed'} of type ${abiType.kind}`);
    }
    switch (abiType.kind) {
      case 'field':
        if (typeof arg === 'number') {
          this.flattened.push(new Fr(BigInt(arg)));
        } else if (typeof arg === 'bigint') {
          this.flattened.push(new Fr(arg));
        } else if (typeof arg === 'string') {
          this.flattened.push(Fr.fromString(arg));
        } else if (typeof arg === 'boolean') {
          this.flattened.push(new Fr(arg ? 1n : 0n));
        } else if (typeof arg === 'object') {
          if (Buffer.isBuffer(arg)) {
            this.flattened.push(Fr.fromBuffer(arg));
          } else if (typeof arg.toField === 'function') {
            this.flattened.push(arg.toField());
          } else if (typeof arg.value === 'string') {
            this.flattened.push(Fr.fromHexString(arg.value));
          } else {
            throw new Error(`Argument for ${name} cannot be serialized to a field`);
          }
        } else {
          throw new Error(`Invalid argument "${arg}" of type ${abiType.kind}`);
        }
        break;
      case 'boolean':
        this.flattened.push(new Fr(arg ? 1n : 0n));
        break;
      case 'array':
        for (let i = 0; i < abiType.length; i += 1) {
          this.encodeArgument(abiType.type, arg[i], `${name}[${i}]`);
        }
        break;
      case 'string':
        for (let i = 0; i < abiType.length; i += 1) {
          // If the string is shorter than the defined length, pad it with 0s.
          const toInsert = i < arg.length ? BigInt((arg as string).charCodeAt(i)) : 0n;
          this.flattened.push(new Fr(toInsert));
        }
        break;
      case 'struct': {
        // If the type defines the encoding to noir, we use it
        if (arg.encodeToNoir !== undefined) {
          this.flattened.push(...arg.encodeToNoir());
          break;
        }

        // If the abi expects a struct like { address: Field } and the supplied arg does not have
        // an address field in it, we try to encode it as if it were a field directly.
        const isAddress = isAddressStruct(abiType);
        if (isAddress && typeof arg.address === 'undefined' && typeof arg.inner === 'undefined') {
          this.encodeArgument({ kind: 'field' }, arg, `${name}.inner`);
          break;
        }
        // Or if the supplied argument does have an address field in it, like a CompleteAddress,
        // we encode it directly as a field.
        if (isAddress && typeof arg.address !== 'undefined') {
          this.encodeArgument({ kind: 'field' }, arg.address, `${name}.address`);
          break;
        }
        if (isFunctionSelectorStruct(abiType)) {
          this.encodeArgument({ kind: 'integer', sign: 'unsigned', width: 32 }, arg.value ?? arg, `${name}.inner`);
          break;
        }
        if (isWrappedFieldStruct(abiType)) {
          this.encodeArgument({ kind: 'field' }, arg.inner ?? arg, `${name}.inner`);
          break;
        }
        if (isBoundedVecStruct(abiType)) {
          this.#encodeBoundedVec(abiType, arg, name);
          break;
        }

        for (const field of abiType.fields) {
          this.encodeArgument(field.type, arg[field.name], `${name}.${field.name}`);
        }
        break;
      }
      case 'integer':
        if (typeof arg === 'string') {
          const value = BigInt(arg);
          this.flattened.push(new Fr(value));
        } else {
          this.flattened.push(new Fr(arg));
        }
        break;
      default:
        throw new Error(`Unsupported type: ${abiType.kind}`);
    }
  }

  /**
   * Encodes all the arguments for the given function ABI.
   * @returns The encoded arguments.
   */
  public encode() {
    for (let i = 0; i < this.abi.parameters.length; i += 1) {
      const parameterAbi = this.abi.parameters[i];
      this.encodeArgument(parameterAbi.type, this.args[i], parameterAbi.name);
    }
    return this.flattened;
  }

  /**
   * Encodes an array as a BoundedVec struct.
   * @dev BoundedVec is handled as a special case rather than a generic struct for two reasons:
   * 1. It is a commonly used type
   * 2. Manual encoding it is cumbersome
   * Therefore, the input is simplified to accept a plain array of type T.
   * @param abiType - The ABI type definition.
   * @param arg - An array of items to encode.
   * @param name - The name of the parameter.
   *
   * The BoundedVec struct is defined in Noir as:
   *
   * ```noir
   * pub struct BoundedVec<T, let MaxLen: u32> {
   *   storage: [T; MaxLen],
   *   len: u32,
   * }
   * ```
   *
   * The encoding follows Noir's serialization format:
   * 1. The storage array is encoded first
   * 2. The length field is encoded second
   */
  #encodeBoundedVec(abiType: AbiType, arg: any, name?: string) {
    // First we encode the storage array
    {
      // Get the storage array type from the BoundedVec struct
      const storageField = (abiType as unknown as any).fields.find((f: any) => f.name === 'storage')!;
      const maxLength = storageField.type.length;

      if (arg.length > maxLength) {
        // Create a preview of the array for the error message, limiting to first few elements
        const preview = arg
          .slice(0, 3)
          .map((x: any) => {
            if (typeof x === 'object' && x !== null) {
              if (Array.isArray(x)) {
                return `[${x.join(', ')}]`;
              }
              // Convert object to string representation of its key-value pairs
              return `{${Object.entries(x)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ')}}`;
            }
            return `${x}`;
          })
          .join(', ');
        const suffix = arg.length > 3 ? ', ...' : '';
        throw new Error(
          `Error encoding param '${name ?? 'unnamed'}': ` +
            `expected an array of maximum length ${maxLength} and got ${arg.length} instead: [ ${preview}${suffix} ]`,
        );
      }

      const storageArrayItemType = storageField.type.type;

      // Now we encode each item in the input array
      for (let i = 0; i < arg.length; i++) {
        this.encodeArgument(storageArrayItemType, arg[i], `storage[${i}]`);
      }

      // Then we pad the storage array with zeros such that the BoundedVec max length is correct.
      const numItemsToPad = maxLength - arg.length;
      if (numItemsToPad > 0) {
        const numFieldsToPad = numItemsToPad * ArgumentEncoder.typeSize(storageArrayItemType);
        const paddingFields = new Array(numFieldsToPad).fill(Fr.ZERO);
        this.flattened.push(...paddingFields);
      }
    }

    // At last we encode the length field
    {
      const lenField = (abiType as unknown as any).fields.find((f: any) => f.name === 'len')!;
      this.encodeArgument(lenField.type, arg.length, 'len');
    }
  }
}

/**
 * Encodes function arguments from TypeScript values to field elements.
 *
 * Converts an array of JavaScript/TypeScript values into the flattened field element
 * array expected by Noir circuits. Handles type conversion, struct flattening,
 * and array expansion automatically based on the function ABI.
 *
 * @param abi - The function ABI defining parameter types
 * @param args - The argument values to encode (must match ABI parameter count)
 * @returns A flat array of field elements ready for circuit execution
 *
 * @throws If arguments don't match the expected types or are undefined
 * @throws If arrays exceed their declared maximum length (for BoundedVec)
 *
 * @remarks
 * The encoder handles several special cases:
 * - **Addresses**: Can be passed as AztecAddress objects or raw fields
 * - **Selectors**: Can be passed as Selector objects or raw numbers
 * - **BoundedVec**: Can be passed as plain arrays (auto-converted to BoundedVec format)
 * - **Structs with `encodeToNoir()`**: If present, uses the custom encoder
 *
 * @example
 * ```typescript
 * // Simple field arguments
 * const encoded = encodeArguments(transferAbi, [
 *   recipientAddress,
 *   new Fr(1000)
 * ]);
 *
 * // Complex struct arguments
 * const encoded = encodeArguments(complexAbi, [
 *   { x: 1, y: 2 },           // struct
 *   [1, 2, 3],                // array
 *   'hello'                   // string
 * ]);
 *
 * // BoundedVec (passed as plain array)
 * const encoded = encodeArguments(vecAbi, [
 *   [item1, item2, item3]     // Automatically padded and length-prefixed
 * ]);
 * ```
 */
export function encodeArguments(abi: FunctionAbi, args: any[]) {
  return new ArgumentEncoder(abi, args).encode();
}

/**
 * Calculates the total number of field elements required for function arguments.
 *
 * Computes the size of the flattened field array that would result from encoding
 * the function's parameters. This is useful for:
 * - Allocating buffers for encoded arguments
 * - Estimating circuit input sizes
 * - Validating argument counts
 *
 * @param abi - The function ABI entry
 * @returns The total number of field elements (after flattening)
 *
 * @remarks
 * The count includes:
 * - 1 field per primitive (field, boolean, integer)
 * - n fields per string of length n
 * - Sum of element sizes for arrays
 * - Sum of field sizes for structs
 *
 * @example
 * ```typescript
 * const abi: FunctionAbi = {
 *   parameters: [
 *     { type: { kind: 'field' } },           // 1 field
 *     { type: { kind: 'array', length: 5,    // 5 fields
 *              type: { kind: 'field' } } }
 *   ]
 * };
 * const size = countArgumentsSize(abi); // Returns 6
 * ```
 */
export function countArgumentsSize(abi: FunctionAbi) {
  return abi.parameters.reduce((acc, parameter) => acc + ArgumentEncoder.typeSize(parameter.type), 0);
}
