import { Fr } from '@aztec/circuits.js';

export type ACVMField = `0x${string}`;

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
  notifyCreatedNote(notePreimage: ACVMField[]): Promise<void>;
  notifyNullifiedNote(nullifier: ACVMField): Promise<void>;
}

export interface ACIRExecutionResult {
  partialWitness: ACVMWitness;
}

export type execute = (acir: Buffer, initialWitness: ACVMWitness, oracle: ACIRCallback) => Promise<ACIRExecutionResult>;

export const acvmMock: execute = (_, initialWitness) => {
  const partialWitness = new Map<number, ACVMField>();
  for (const [key, value] of initialWitness.entries()) {
    partialWitness.set(key, value);
  }
  return Promise.resolve({ partialWitness });
};

export function toACVMField(value: Fr | Buffer | boolean): `0x${string}` {
  if (typeof value === 'boolean') {
    return value ? '0x01' : '0x00';
  }
  let buffer;
  if (!Buffer.isBuffer(value)) {
    buffer = value.buffer;
  } else {
    buffer = value;
  }
  return `0x${buffer.toString('hex')}`;
}

export function fromACVMField(field: `0x${string}`): Fr {
  const buffer = Buffer.from(field.slice(2), 'hex');
  return new Fr(buffer);
}
