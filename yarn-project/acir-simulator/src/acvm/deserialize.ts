import { PrivateCircuitPublicInputs, PublicCircuitPublicInputs } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { FieldReader } from '@aztec/foundation/serialize';

import { getReturnWitness } from '@noir-lang/acvm_js';

import { ACVMField, ACVMWitness } from './acvm_types.js';

/**
 * Converts an ACVM field to a Fr.
 * @param field - The ACVM field to convert.
 * @returns The Fr.
 */
export function fromACVMField(field: ACVMField): Fr {
  return Fr.fromBuffer(Buffer.from(field.slice(2), 'hex'));
}

/**
 * Converts a field to a number.
 * @param fr - The field to convert.
 * @returns The number.
 */
export function frToNumber(fr: Fr): number {
  return Number(fr.value);
}

/**
 * Extracts the return fields of a given partial witness.
 * @param acir - The bytecode of the function.
 * @param partialWitness - The witness to extract from.
 * @returns The return values.
 */
export function extractReturnWitness(acir: Buffer, partialWitness: ACVMWitness): Fr[] {
  const returnWitness = getReturnWitness(acir, partialWitness);
  const sortedKeys = [...returnWitness.keys()].sort((a, b) => a - b);
  return sortedKeys.map(key => returnWitness.get(key)!).map(fromACVMField);
}

/**
 * Create a reader for the public inputs of the ACVM generated partial witness.
 */
function createPublicInputsReader(witness: ACVMWitness, acir: Buffer) {
  const fields = extractReturnWitness(acir, witness);
  return new FieldReader(fields);
}

/**
 * Extracts the public inputs from the ACVM generated partial witness.
 * @param partialWitness - The partial witness.
 * @param acir - The ACIR bytecode.
 * @returns The public inputs.
 */
export function extractPrivateCircuitPublicInputs(
  partialWitness: ACVMWitness,
  acir: Buffer,
): PrivateCircuitPublicInputs {
  const witnessReader = createPublicInputsReader(partialWitness, acir);
  return PrivateCircuitPublicInputs.fromFields(witnessReader);
}

/**
 * Extracts the public circuit public inputs from the ACVM generated partial witness.
 * @param partialWitness - The partial witness.
 * @param acir - The ACIR bytecode.
 * @returns The public inputs.
 */
export function extractPublicCircuitPublicInputs(partialWitness: ACVMWitness, acir: Buffer): PublicCircuitPublicInputs {
  const witnessReader = createPublicInputsReader(partialWitness, acir);
  return PublicCircuitPublicInputs.fromFields(witnessReader);
}
