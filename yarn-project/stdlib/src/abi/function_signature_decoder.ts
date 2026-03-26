import type { ABIParameter, ABIVariable, AbiType } from './abi.js';

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
        return param.sign === 'signed' ? `i${param.width}` : `u${param.width}`;
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
