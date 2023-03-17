import { Hasher } from '@aztec/barretenberg/merkle_tree';

/**
 * A named type.
 */
export interface ABIVariable {
  /**
   * The name of the variable.
   */
  name: string;
  /**
   * The type of the variable.
   */
  type: ABIType;
}

/**
 * A function parameter.
 */
export interface ABIParameter extends ABIVariable {
  /**
   * Whether the parameter is unpacked.
   */
  unpacked: boolean;
}

/**
 * A variable type.
 */
export type ABIType = BasicType<'field'> | BasicType<'boolean'> | IntegerType | ArrayType | StringType | StructType;

/**
 * A basic type.
 */
export interface BasicType<T extends string> {
  /**
   * The kind of the type.
   */
  kind: T;
}
/**
 * An integer type.
 */
export interface IntegerType extends BasicType<'integer'> {
  /**
   * The sign of the integer.
   */
  sign: string;
  /**
   * The width of the integer in bits.
   */
  width: number;
}

/**
 * An array type.
 */
export interface ArrayType extends BasicType<'array'> {
  /**
   * The length of the array.
   */
  length: number;
  /**
   * The type of the array elements.
   */
  type: ABIType;
}

/**
 * A string type.
 */
export interface StringType extends BasicType<'string'> {
  /**
   * The length of the string.
   */
  length: number;
}

/**
 * A struct type.
 */
export interface StructType extends BasicType<'struct'> {
  /**
   * The fields of the struct.
   */
  fields: Array<ABIVariable>;
}

/**
 * The ABI entry of a function.
 */
export interface FunctionAbi {
  /**
   * The name of the function.
   */
  name: string;
  /**
   * Whether the function is a constructor.
   */
  isConstructor: boolean;
  /**
   * Whether the function is secret.
   */
  isSecret: boolean;
  /**
   * Function parameters.
   */
  parameters: Array<ABIParameter>;
  /**
   * The types of the return values.
   */
  returnTypes: Array<ABIType>;
  /**
   * The ACIR bytecode of the function.
   */
  bytecode: string;
  /**
   * The verification key of the function.
   */
  verificationKey: string;
}

/**
 * The ABI of a contract.
 */
export interface ContractAbi {
  /**
   * The functions of the contract.
   */
  functions: Array<FunctionAbi>;
}

/**
 * Computes a selector of a function.
 * @param functionAbi - The function ABI entry.
 * @param hasher - The hasher to use.
 * @returns The selector bytes.
 */
export function computeSelector(functionAbi: FunctionAbi, hasher: Hasher) {
  const signature = `${functionAbi.name}(${functionAbi.parameters.map(param => param.type).join(',')})`;
  const signatureHash = hasher.hashToField(Buffer.from(signature));
  return signatureHash.slice(0, 4);
}
