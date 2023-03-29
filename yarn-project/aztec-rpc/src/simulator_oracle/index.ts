import { DBOracle, NoteLoadOracleInputs } from '@aztec/acir-simulator';
import { AztecAddress, EthAddress } from '@aztec/circuits.js';
import { Database } from '../database/database.js';
import { KeyStore } from '../key_store/key_store.js';

export class SimulatorOracle implements DBOracle {
  constructor(private db: Database, private keyStore: KeyStore) {}

  getSecretKey(_: AztecAddress, publicKey: AztecAddress): Promise<Buffer> {
    return this.keyStore.getAccountPrivateKey(publicKey);
  }

  async getNotes(contractAddress: AztecAddress, storageSlot: Buffer): Promise<NoteLoadOracleInputs[]> {
    const noteDaos = await this.db.getNotes(contractAddress, storageSlot);
    return noteDaos.map(noteDao => ({
      note: noteDao.notePreimage.fields,
      siblingPath: [], // TODO get this from node
      index: noteDao.index,
    }));
  }

  async getBytecode(contractAddress: AztecAddress, functionSelector: Buffer): Promise<Buffer> {
    const contract = await this.db.getContract(contractAddress);
    if (!contract) {
      throw new Error(`Contract ${contractAddress} not found`);
    }

    const storedFunction = contract.functions.find(f => f.selector === functionSelector);
    if (!storedFunction) {
      throw new Error(`Function ${functionSelector} not found`);
    }

    return Buffer.from(storedFunction.bytecode, 'base64');
  }

  async getPortalContractAddress(contractAddress: AztecAddress): Promise<EthAddress> {
    const contract = await this.db.getContract(contractAddress);
    if (!contract) {
      throw new Error(`Contract ${contractAddress} not found`);
    }
    return contract.portalAddress;
  }
}
