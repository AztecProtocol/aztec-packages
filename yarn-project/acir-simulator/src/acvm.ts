import { NoteLoadOracleInputs } from './db_oracle.js';

export interface ACIRCallback {
  getSecretKey(publicKey: Buffer): Promise<Buffer>;
  getNotes2(storageSlot: Buffer): Promise<NoteLoadOracleInputs[]>;
  getRandomField(): Promise<Buffer>;
  notifyCreateNote(notePreimage: Buffer) : Promise<void>;
  notifyNullifiedNote(notePreimage: Buffer): Promise<void>;
}

export interface ACIRExecutionResult {
  partialWitness: Map<number, `0x${string}`>,
}

export type execute = (
  acir: Buffer,
  initialWitness: Map<number, `0x${string}`>,
  oracle: ACIRCallback,
) => Promise<ACIRExecutionResult>;
