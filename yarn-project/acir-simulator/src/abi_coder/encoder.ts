import { ABIType, FunctionAbi } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';
import { hasOwnProperty } from '@aztec/foundation/types';

/**
 * Encodes arguments for a function call.
 * Missing support for integer and string.
 */
class ArgumentEncoder {
  private flattened: Fr[] = [];

  constructor(private abi: FunctionAbi, private args: any[]) {}

  private pushField(field: Fr) {
    // Since we have fairly dynamic code for contract calling, try to catch runtime errors early.
    if (!(field instanceof Fr)) {
      throw new Error(`Expected field, got a '${typeof field}'`);
    }
    this.flattened.push(field);
  }
  /**
   * Encodes a single argument from the given type to field.
   * @param abiType - The abi type of the argument.
   * @param arg - The value to encode.
   */
  private encodeArgument(abiType: ABIType, arg: any) {
    if (arg === undefined || arg == null) throw new Error(`Undefined argument of type ${abiType.kind}`);
    switch (abiType.kind) {
      case 'field':
        if (typeof arg === 'number') {
          this.pushField(new Fr(BigInt(arg)));
        } else if (typeof arg === 'bigint') {
          this.pushField(new Fr(arg));
        } else if (arg instanceof Uint8Array) {
          this.pushField(Fr.fromBuffer(Buffer.from(arg)));
        } else if (typeof arg === 'object') {
          if (typeof arg.toField === 'function') {
            this.pushField(arg.toField());
          } else {
            this.pushField(arg);
          }
        } else {
          throw new Error(`Expected a field in ABI argument encoding, got: ${typeof arg}`);
        }
        break;
      case 'boolean':
        this.pushField(new Fr(arg ? 1n : 0n));
        break;
      case 'array':
        for (let i = 0; i < abiType.length; i += 1) {
          this.encodeArgument(abiType.type, arg[i]);
        }
        break;
      case 'struct':
        for (const field of abiType.fields) {
          if (!hasOwnProperty(arg, field.name)) {
            throw new Error(`Error while encoding arguments, expected an object with ${field.name}`);
          }
          this.encodeArgument(field.type, arg[field.name]);
        }
        break;
      case 'integer':
        this.pushField(new Fr(arg));
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
    if (this.abi.parameters.length != this.args.length) {
      throw new Error(`ABI parameters have length ${this.abi.parameters.length} but got ${this.args.length} arguments`);
    }
    for (let i = 0; i < this.abi.parameters.length; i += 1) {
      const parameterAbi = this.abi.parameters[i];
      this.encodeArgument(parameterAbi.type, this.args[i]);
    }
    return this.flattened;
  }
}

/**
 * Encodes all the arguments for a function call.
 * @param abi - The function ABI entry.
 * @param args - The arguments to encode.
 * @returns The encoded arguments.
 */
export function encodeArguments(abi: FunctionAbi, args: any[]) {
  return new ArgumentEncoder(abi, args).encode();
}
