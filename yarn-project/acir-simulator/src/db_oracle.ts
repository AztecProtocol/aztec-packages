import { AztecAddress, EthAddress, Fr } from './circuits.js';

export interface NoteLoadOracleInputs {
  note: Fr[];
  siblingPath: Fr[];
  index: number;
}

export interface DBOracle {
  getSecretKey(contractAddress: AztecAddress, keyId: Buffer): Promise<Buffer>;
  getNotes(contractAddress: AztecAddress, storageSlot: Buffer): Promise<NoteLoadOracleInputs[]>;
  getBytecode(contractAddress: AztecAddress, functionSelector: Buffer): Promise<Buffer>;
  getPortalContractAddress(contractAddress: AztecAddress): Promise<EthAddress>;
}
