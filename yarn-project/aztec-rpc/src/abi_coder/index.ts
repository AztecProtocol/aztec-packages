import { FUNCTION_SELECTOR_NUM_BYTES } from '@aztec/circuits.js';
import { ABIParameter, generateFunctionSelector as generateFunctionSelectorSizeN } from '@aztec/foundation/abi';

/**
 * Generate a function selector for a given function name and parameters.
 * It is derived by taking the first 4 bytes of the Keccak-256 hash of the function signature.
 *
 * @param name - The name of the function.
 * @param parameters - An array of ABIParameter objects, each containing the type information of a function parameter.
 * @returns A Buffer containing the 4-byte function selector.
 */
export function generateFunctionSelector(name: string, parameters: ABIParameter[]) {
  return generateFunctionSelectorSizeN(name, parameters, FUNCTION_SELECTOR_NUM_BYTES);
}
