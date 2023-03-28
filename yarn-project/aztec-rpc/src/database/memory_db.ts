import { AztecAddress, Fr } from '@aztec/foundation';
import { MemoryContractDataSource } from '../contract_data_source/index.js';
import { TxHash } from '../tx/index.js';
import { Database } from './database.js';
import { NoteDao } from './note_dao.js';
import { TxDao } from './tx_dao.js';

// TODO Transform this into a mixin?
export class MemoryDB extends MemoryContractDataSource implements Database {
  private txs: TxDao[] = [];
  private notes: NoteDao[] = [];

  public getTx(txHash: TxHash) {
    return Promise.resolve(this.txs.find(tx => tx.txHash.equals(txHash)));
  }

  public addNote(note: NoteDao) {
    this.notes.push(note);
    return Promise.resolve();
  }

  public getNote(nullifier: Fr) {
    const found = this.notes.find(note => note.nullifier.toBuffer().equals(nullifier.toBuffer()));
    if (!found) {
      return Promise.reject();
    }
    return Promise.resolve(found);
  }

  public getNotes(contractAddress: AztecAddress, storageSlot: Buffer): Promise<NoteDao[]> {
    return Promise.resolve(
      this.notes.filter(
        note => note.contractAddress.equals(contractAddress) && note.contractSlot.toBuffer().equals(storageSlot),
      ),
    );
  }

  public addOrUpdateTx(tx: TxDao): Promise<void> {
    const index = this.txs.findIndex(t => t.txHash.equals(tx.txHash));
    if (index === -1) {
      this.txs.push(tx);
    } else {
      this.txs[index] = tx;
    }
    return Promise.resolve();
  }
}
