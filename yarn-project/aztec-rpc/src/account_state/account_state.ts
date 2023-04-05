import { AztecNode } from '@aztec/aztec-node';
import { Grumpkin } from '@aztec/barretenberg.js/crypto';
import { KERNEL_NEW_COMMITMENTS_LENGTH } from '@aztec/circuits.js';
import { AztecAddress, createDebugLogger, Fr, keccak, Point } from '@aztec/foundation';
import { L2Block, UnverifiedData } from '@aztec/l2-block';
import { createTxHashes, getTxHash } from '@aztec/tx';
import { NotePreimage, TxAuxData } from '../aztec_rpc_server/tx_aux_data/index.js';
import { Database, TxAuxDataDao, TxDao } from '../database/index.js';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/l1-contracts';

export class AccountState {
  public syncedToBlock = 0;
  private publicKey: Point;
  private address: AztecAddress;

  constructor(
    private readonly privKey: Buffer,
    private db: Database,
    private node: AztecNode,
    private grumpkin: Grumpkin,
    private TXS_PER_BLOCK = 1,
    private log = createDebugLogger('aztec:aztec_rpc_account_state'),
  ) {
    if (privKey.length !== 32) {
      throw new Error(`Invalid private key length. Received ${privKey.length}, expected 32`);
    }
    this.publicKey = Point.fromBuffer(this.grumpkin.mul(Grumpkin.generator, this.privKey));
    this.address = this.publicKey.toAddress();
  }

  public async isSynchronised() {
    const remoteBlockHeight = await this.node.getBlockHeight();
    return this.syncedToBlock === remoteBlockHeight;
  }

  public getSyncedToBlock() {
    return this.syncedToBlock;
  }

  public getPublicKey() {
    return this.publicKey;
  }

  public getTxs() {
    return this.db.getTxsByAddress(this.address);
  }

  public createUnverifiedData(contract: AztecAddress, newNotes: { preimage: Fr[]; storageSlot: Fr }[]): UnverifiedData {
    const txAuxDatas = newNotes.map(({ preimage, storageSlot }) => {
      const notePreimage = new NotePreimage(preimage);
      return new TxAuxData(notePreimage, contract, storageSlot);
    });
    const chunks = txAuxDatas.map(txAuxData => {
      // TODO - Should use the correct recipient public key.
      const recipient = this.publicKey;
      return txAuxData.toEncryptedBuffer(recipient, this.grumpkin);
    });
    return new UnverifiedData(chunks);
  }

  public async process(l2Blocks: L2Block[], unverifiedDatas: UnverifiedData[]): Promise<void> {
    if (l2Blocks.length !== unverifiedDatas.length) {
      throw new Error(
        `Number of blocks and unverifiedData is not equal. Received ${l2Blocks.length} blocks, ${unverifiedDatas.length} unverified data.`,
      );
    }
    if (!l2Blocks.length) {
      return;
    }

    let dataStartIndex =
      (l2Blocks[0].number - INITIAL_L2_BLOCK_NUM) * this.TXS_PER_BLOCK * KERNEL_NEW_COMMITMENTS_LENGTH;
    // We will store all the decrypted data in this array so that we can later batch insert it all into the database.
    const blocksAndTxAuxData: { block: L2Block; userPertainingTxIndices: number[]; txAuxDataDaos: TxAuxDataDao[] }[] =
      [];

    // Iterate over both blocks and unverified data.
    for (let i = 0; i < unverifiedDatas.length; ++i) {
      const l2Block = l2Blocks[i];
      const dataChunks = unverifiedDatas[i].dataChunks;

      // Try decrypting the unverified data.
      const txIndices: Set<number> = new Set();
      const txAuxDataDaos: TxAuxDataDao[] = [];
      for (let j = 0; j < dataChunks.length; ++j) {
        const txAuxData = TxAuxData.fromEncryptedBuffer(dataChunks[j], this.privKey, this.grumpkin);
        if (txAuxData) {
          // We have successfully decrypted the data.
          const txIndex = Math.floor(j / KERNEL_NEW_COMMITMENTS_LENGTH);
          txIndices.add(txIndex);
          txAuxDataDaos.push({
            ...txAuxData,
            nullifier: Fr.random(), // TODO
            index: dataStartIndex + j,
          });
        }
      }

      blocksAndTxAuxData.push({ block: l2Block, userPertainingTxIndices: [...txIndices], txAuxDataDaos });
      dataStartIndex += dataChunks.length;
    }

    await this.processBlocksAndTxAuxData(blocksAndTxAuxData);

    this.syncedToBlock = l2Blocks[l2Blocks.length - 1].number;
    this.log(`Synched block ${this.syncedToBlock}`);
  }

  private async processBlocksAndTxAuxData(
    blocksAndTxAuxData: { block: L2Block; userPertainingTxIndices: number[]; txAuxDataDaos: TxAuxDataDao[] }[],
  ) {
    const txAuxDataDaosBatch: TxAuxDataDao[] = [];
    const txDaos: TxDao[] = [];
    for (let i = 0; i < blocksAndTxAuxData.length; ++i) {
      const { block, userPertainingTxIndices, txAuxDataDaos } = blocksAndTxAuxData[i];
      const blockHash = keccak(block.encode());
      userPertainingTxIndices.map((userPertainingTxIndex, j) => {
        const txHash = getTxHash(block, userPertainingTxIndex);
        this.log(`Processing tx ${txHash.toString()} from block ${block.number}`);
        const txAuxData = txAuxDataDaos[j];
        const isContractDeployment = true; // TODO
        const [to, contractAddress] = isContractDeployment
          ? [undefined, txAuxData.contractAddress]
          : [txAuxData.contractAddress, undefined];
        txDaos.push({
          txHash,
          blockHash,
          blockNumber: block.number,
          from: this.address,
          to,
          contractAddress,
          error: '',
        });
      });
      txAuxDataDaosBatch.push(...txAuxDataDaos);
      await this.updateBlockInfoInBlockTxs(block);
    }
    if (txAuxDataDaosBatch.length) await this.db.addTxAuxDataBatch(txAuxDataDaosBatch);
    if (txDaos.length) await this.db.addTxs(txDaos);
  }

  private async updateBlockInfoInBlockTxs(block: L2Block) {
    for (const txHash of createTxHashes(block)) {
      const txDao: TxDao | undefined = await this.db.getTx(txHash);
      if (txDao !== undefined) {
        txDao.blockHash = keccak(block.encode());
        txDao.blockNumber = block.number;
        await this.db.addTx(txDao);
        this.log(`Added tx with hash ${txHash.toString()} from block ${block.number}`);
      } else {
        this.log(`Tx with hash ${txHash.toString()} from block ${block.number} not found in db`);
      }
    }
  }
}
