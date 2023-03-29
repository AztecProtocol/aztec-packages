import { AztecAddress, EthAddress, Fr } from '@aztec/circuits.js';

export type ACVMField = `0x${string}`;

const ZERO_ACVM_FIELD: ACVMField = `0x${Buffer.alloc(32).toString('hex')}`;
const ONE_ACVM_FIELD: ACVMField = `0x${'00'.repeat(31)}01`;

export interface ACVMNoteInputs {
  note: ACVMField[];
  siblingPath: ACVMField[];
  index: number;
  root: ACVMField;
}

export type ACVMWitness = Map<number, ACVMField>;

export interface ACIRCallback {
  getSecretKey(publicKey: ACVMField): Promise<ACVMField>;
  getNotes2(storageSlot: ACVMField): Promise<ACVMNoteInputs[]>;
  getRandomField(): Promise<ACVMField>;
  notifyCreatedNote(preimage: ACVMField[], storageSlot: ACVMField): Promise<void>;
  notifyNullifiedNote(nullifier: ACVMField): Promise<void>;
}

export interface ACIRExecutionResult {
  partialWitness: ACVMWitness;
}

export type execute = (acir: Buffer, initialWitness: ACVMWitness, oracle: ACIRCallback) => Promise<ACIRExecutionResult>;

export const acvmMock: execute = (_, initialWitness) => {
  const partialWitness = new Map<number, ACVMField>();
  for (let i = 0; i < 100; i++) {
    if (initialWitness.has(i)) {
      partialWitness.set(i, initialWitness.get(i)!);
    } else {
      partialWitness.set(i, ZERO_ACVM_FIELD);
    }
  }

  return Promise.resolve({ partialWitness });
};

function adaptBufferSize(originalBuf: Buffer) {
  const buffer = Buffer.alloc(32);
  if (originalBuf.length > buffer.length) {
    throw new Error('Buffer does not fit in 32 bytes');
  }
  originalBuf.copy(buffer, buffer.length - originalBuf.length);
  return buffer;
}

export function toACVMField(value: AztecAddress | EthAddress | Fr | Buffer | boolean): `0x${string}` {
  if (typeof value === 'boolean') {
    return value ? ONE_ACVM_FIELD : ZERO_ACVM_FIELD;
  }

  let buffer;

  if (Buffer.isBuffer(value)) {
    buffer = value;
  } else {
    buffer = value.toBuffer();
  }

  return `0x${adaptBufferSize(buffer).toString('hex')}`;
}

export function fromACVMField(field: `0x${string}`): Fr {
  const buffer = Buffer.from(field.slice(2), 'hex');
  return Fr.fromBuffer(buffer);
}

export interface FunctionWitnessIndexes {
  paramWitnesses: Record<string, number>;
  returnWitneses: number[];
}
