import { Grumpkin } from '@aztec/barretenberg.js/crypto';
import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';
import { AztecAddress } from '@aztec/circuits.js';
import { L2Block } from '@aztec/l2-block';
import { UnverifiedData } from '@aztec/l2-block';
import { TxHash } from '@aztec/tx';
import { TxAuxData } from '../aztec_rpc_server/tx_aux_data/tx_aux_data.js';
import { Database } from '../database/index.js';
import { TxAuxDataDao } from '../database/tx_aux_data_dao.js';

export class AccountState {
  public syncedTo = 0;
  private grumpkin?: Grumpkin;
  private pubKey?: AztecAddress;

  constructor(private readonly privKey: Buffer, private db: Database) {
    if (privKey.length !== 32) {
      throw new Error(`Invalid private key length. Received ${privKey.length}, expected 32`);
    }
  }

  public getTx(txHash: TxHash) {
    return this.db.getTx(txHash);
  }

  public syncToBlock(block: L2Block) {
    this.syncedTo = block.number;

  }
  public async getPubKey(): Promise<AztecAddress> {
    if (!this.pubKey) {
      const grumpkin = await this.getGrumpkin();
      this.pubKey = AztecAddress.fromBuffer(grumpkin.mul(Grumpkin.generator, this.privKey));
    }
    return this.pubKey;
  }

  public async processUnverifiedData(unverifiedData: UnverifiedData[]): Promise<void> {
    for (const data of unverifiedData) {
      for (const encryptedTxAuxData of data.dataChunks) {
        const txAuxData = TxAuxData.fromEncryptedBuffer(encryptedTxAuxData, this.privKey, await this.getGrumpkin());
        if (txAuxData) {
          const txAuxDataDao = TxAuxDataDao.fromTxAuxData(txAuxData);
          await this.db.addTxAuxDataDao(txAuxDataDao);
        }
      }
    }
  }

  private async getGrumpkin(): Promise<Grumpkin> {
    if (!this.grumpkin) {
      const wasm = await BarretenbergWasm.new();
      this.grumpkin = new Grumpkin(wasm);
    }
    return this.grumpkin;
  }
}
