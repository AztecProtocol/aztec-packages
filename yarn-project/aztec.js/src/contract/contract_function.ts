import { encodeFunctionSignature, encodeParameters, generateFunctionSignature } from '../abi_coder/index.js';
import { FunctionAbi } from '../noir_js/index.js';

export class ContractFunction {
  constructor(private abi: FunctionAbi) {}

  public encodeABI() {
    return encodeFunctionSignature(generateFunctionSignature(this.abi.name, this.abi.parameters));
  }

  public encodeParameters(args: any[]) {
    return encodeParameters(this.abi.parameters, args);
  }
}
