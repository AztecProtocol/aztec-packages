import { PrivateCircuitPublicInputs, AztecAddress, EthAddress, Fr } from '@aztec/circuits.js';

export interface NoteLoadOracleInputs {
  note: Fr[];
  siblingPath: Fr[];
  index: number;
}

export interface DBOracle {
  getSecretKey(contractAddress: AztecAddress, publicKey: AztecAddress): Promise<Buffer>;
  getNotes(contractAddress: AztecAddress, storageSlot: Buffer): Promise<NoteLoadOracleInputs[]>;
  getBytecode(contractAddress: AztecAddress, functionSelector: Buffer): Promise<Buffer>;
  getPortalContractAddress(contractAddress: AztecAddress): Promise<EthAddress>;
}

export class PrivateCallStackItem {
  constructor(
    public readonly contractAddress: AztecAddress,
    public readonly functionSelector: number,
    public readonly publicInputs: PrivateCircuitPublicInputs,
  ) {}
}
