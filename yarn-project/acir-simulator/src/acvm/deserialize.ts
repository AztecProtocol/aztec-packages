import { ACVMField, ACVMWitness, fromACVMField } from './acvm.js';

import {
  CallContext,
  ContractDeploymentData,
  NEW_L2_TO_L1_MSGS_LENGTH,
  NEW_COMMITMENTS_LENGTH,
  NEW_NULLIFIERS_LENGTH,
  PRIVATE_CALL_STACK_LENGTH,
  PUBLIC_CALL_STACK_LENGTH,
  PrivateCircuitPublicInputs,
  READ_REQUESTS_LENGTH,
  RETURN_VALUES_LENGTH,
} from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr, Point } from '@aztec/foundation/fields';
import { getReturnWitness } from 'acvm-simulator';

// Utilities to read TS classes from ACVM Field arrays
// In the order that the ACVM provides them

/**
 * Converts a field to an Aztec address.
 * @param fr - The field to convert.
 * @returns The Aztec address.
 */
export function frToAztecAddress(fr: Fr): AztecAddress {
  return new AztecAddress(fr.toBuffer());
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
 * Converts a field to a boolean.
 * @param fr - The field to convert.
 * @returns The boolean.
 */
export function frToBoolean(fr: Fr): boolean {
  const buf = fr.toBuffer();
  return buf[buf.length - 1] !== 0;
}

/**
 * Converts a field to a function selector.
 * @param fr - The field to convert.
 * @returns The function selector.
 */
export function frToSelector(fr: Fr): Buffer {
  return fr.toBuffer().slice(-4);
}

/**
 * Extracts the return fields of a given partial witness.
 * @param acir - The bytecode of the function.
 * @param partialWitness - The witness to extract from.
 * @returns The return values.
 */
export function extractReturnWitness(acir: Buffer, partialWitness: ACVMWitness): ACVMField[] {
  const returnWitness = getReturnWitness(acir, partialWitness);
  const sortedKeys = [...returnWitness.keys()].sort((a, b) => a - b);
  return sortedKeys.map(key => returnWitness.get(key)!);
}

/**
 * A utility reader for the public inputs of the ACVM generated partial witness.
 */
export class PublicInputsReader {
  private publicInputs: ACVMField[];

  constructor(witness: ACVMWitness, acir: Buffer) {
    this.publicInputs = extractReturnWitness(acir, witness);
  }

  /**
   * Reads a field from the public inputs.
   * @returns The field.
   */
  public readField(): Fr {
    const acvmField = this.publicInputs.shift();
    if (!acvmField) throw new Error('Not enough public inputs');
    return fromACVMField(acvmField);
  }

  /**
   * Reads an array of fields from the public inputs.
   * @param length - The length of the array.
   * @returns The array of fields.
   */
  public readFieldArray(length: number): Fr[] {
    const array: Fr[] = [];
    for (let i = 0; i < length; i++) {
      array.push(this.readField());
    }
    return array;
  }
}

/**
 * Extracts the public inputs from the ACVM generated partial witness.
 * @param partialWitness - The partial witness.
 * @param acir - The ACIR bytecode.
 * @returns The public inputs.
 */
export function extractPublicInputs(partialWitness: ACVMWitness, acir: Buffer): PrivateCircuitPublicInputs {
  const witnessReader = new PublicInputsReader(partialWitness, acir);

  const callContext = new CallContext(
    frToAztecAddress(witnessReader.readField()),
    frToAztecAddress(witnessReader.readField()),
    witnessReader.readField(),
    frToBoolean(witnessReader.readField()),
    frToBoolean(witnessReader.readField()),
    frToBoolean(witnessReader.readField()),
  );

  const argsHash = witnessReader.readField();
  const returnValues = witnessReader.readFieldArray(RETURN_VALUES_LENGTH);
  const readRequests = witnessReader.readFieldArray(READ_REQUESTS_LENGTH);
  const newCommitments = witnessReader.readFieldArray(NEW_COMMITMENTS_LENGTH);
  const newNullifiers = witnessReader.readFieldArray(NEW_NULLIFIERS_LENGTH);
  const privateCallStack = witnessReader.readFieldArray(PRIVATE_CALL_STACK_LENGTH);
  const publicCallStack = witnessReader.readFieldArray(PUBLIC_CALL_STACK_LENGTH);
  const newL2ToL1Msgs = witnessReader.readFieldArray(NEW_L2_TO_L1_MSGS_LENGTH);

  // TODO #588, relevant issue: https://github.com/AztecProtocol/aztec-packages/issues/588
  // const encryptedLogsHash = witnessReader.readFieldArray(NUM_FIELDS_PER_SHA256);
  // const unencryptedLogsHash = witnessReader.readFieldArray(NUM_FIELDS_PER_SHA256);
  // const encryptedLogPreimagesLength = witnessReader.readField();
  // const unencryptedLogPreimagesLength = witnessReader.readField();
  const encryptedLogsHash = [new Fr(0), new Fr(0)] as [Fr, Fr];
  const unencryptedLogsHash = [new Fr(0), new Fr(0)] as [Fr, Fr];
  const encryptedLogPreimagesLength = new Fr(0);
  const unencryptedLogPreimagesLength = new Fr(0);

  const privateDataTreeRoot = witnessReader.readField();
  const nullifierTreeRoot = witnessReader.readField();
  const contractTreeRoot = witnessReader.readField();
  const l1Tol2TreeRoot = witnessReader.readField();

  const contractDeploymentData = new ContractDeploymentData(
    // TODO: Uncomment when we fix the "too many unknowns" Noir issue
    // [witnessReader.readField(), witnessReader.readField()],
    Point.ZERO,
    witnessReader.readField(),
    witnessReader.readField(),
    witnessReader.readField(),
    EthAddress.fromField(witnessReader.readField()),
  );

  const chainId = witnessReader.readField();
  const version = witnessReader.readField();

  return new PrivateCircuitPublicInputs(
    callContext,
    argsHash,
    returnValues,
    readRequests,
    newCommitments,
    newNullifiers,
    privateCallStack,
    publicCallStack,
    newL2ToL1Msgs,
    encryptedLogsHash,
    unencryptedLogsHash,
    encryptedLogPreimagesLength,
    unencryptedLogPreimagesLength,
    privateDataTreeRoot,
    nullifierTreeRoot,
    contractTreeRoot,
    l1Tol2TreeRoot,
    contractDeploymentData,
    chainId,
    version,
  );
}
