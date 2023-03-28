import { AztecAddress, Fr } from '../circuits.js';
import { ContractDataSource } from '../contract_data_source/index.js';
import { TxHash } from '../tx/index.js';
import { NoteDao } from './note_dao.js';
import { TxDao } from './tx_dao.js';

export interface Database extends ContractDataSource {
  getTx(txHash: TxHash): Promise<TxDao | undefined>;

  addNote(note: NoteDao): Promise<void>;
  getNote(nullifier: Fr): Promise<NoteDao>;
  getNotes(contractAddress: AztecAddress, storageSlot: Buffer): Promise<NoteDao[]>;
}
