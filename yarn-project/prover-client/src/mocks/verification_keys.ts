import { VerificationKey, VerificationKeyAsFields } from '@aztec/circuits.js';

/**
 * Well-known verification keys.
 */
export interface VerificationKeys {
  /**
   * Verification key for the default public kernel circuit.
   */
  publicKernelCircuit: VerificationKey;
  /**
   * Verification key for the default private kernel circuit.
   */
  privateKernelCircuit: VerificationKeyAsFields;
  /**
   * Verification key for the default base rollup circuit.
   */
  baseRollupCircuit: VerificationKey;
  /**
   * Verification key for the default merge rollup circuit.
   */
  mergeRollupCircuit: VerificationKey;
}

/**
 * Returns mock verification keys for each well known circuit.
 * @returns A VerificationKeys object with fake values.
 */
export function getVerificationKeys(): VerificationKeys {
  return {
    privateKernelCircuit: VerificationKeyAsFields.makeFake(),
    baseRollupCircuit: VerificationKey.makeFake(),
    mergeRollupCircuit: VerificationKey.makeFake(),
    publicKernelCircuit: VerificationKey.makeFake(),
  };
}
