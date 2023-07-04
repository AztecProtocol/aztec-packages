import { ABIType, FunctionAbi } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';

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
      throw new Error(`Expected field, got '${field}'`);
    }
    this.flattened.push(field);
  }
  /**
   * Encodes a single argument from the given type to field.
   * @param abiType - The abi type of the argument.
   * @param arg - The value to encode.
   */
  private encodeArgument(abiType: ABIType, arg: any) {
    switch (abiType.kind) {
      case 'field':
        if (typeof arg === 'number') {
          this.pushField(new Fr(BigInt(arg)));
        } else if (typeof arg === 'bigint') {
          this.pushField(new Fr(arg));
        } else if (typeof arg === 'object') {
          if (typeof arg.toField === 'function') {
            this.pushField(arg.toField());
          } else {
            this.pushField(arg);
          }
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
