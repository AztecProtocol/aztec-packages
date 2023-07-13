import { AztecNode } from '@aztec/aztec-node';
import { AztecAddress, CircuitsWasm, MAX_NEW_COMMITMENTS_PER_TX } from '@aztec/circuits.js';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import {
  INITIAL_L2_BLOCK_NUM,
  L2BlockContext,
  L2BlockL2Logs,
  NoteSpendingInfo,
  PublicKey,
  KeyStore,
} from '@aztec/types';
import { Database, NoteSpendingInfoDao, TxDao } from '../database/index.js';
import { getAcirSimulator } from '../simulator/index.js';

/**
 * Contains all the decrypted data in this array so that we can later batch insert it all into the database.
 */
interface ProcessedData {
  /**
   * Holds L2 block data and associated context.
   */
  blockContext: L2BlockContext;
  /**
   * Indices of transactions in the block that emitted encrypted log which the user could decrypt.
   */
  userPertainingTxIndices: number[];
  /**
   * A collection of data access objects for note spending info.
   */
  noteSpendingInfoDaos: NoteSpendingInfoDao[];
}

/**
 * NoteProcessor is responsible for decrypting logs and converting them to notes via their originating contracts
 * before storing them against
 */
export class NoteProcessor {
  /**
   * The latest L2 block number that the account state has synchronized to.
   */
  public syncedToBlock = 0;

  constructor(
    /**
     * The public counterpart to the private key to be used in note decryption.
     */
    public readonly publicKey: PublicKey,
    private address: AztecAddress, // TODO: Remove once owner addreses are emitted by contracts
    private keyStore: KeyStore,
    private db: Database,
    private node: AztecNode,
    private TXS_PER_BLOCK = 4,
    private log = createDebugLogger('aztec:aztec_note_processor'),
  ) {}

  /**
   * Check if the NoteProcessor is synchronised with the remote block height.
   * The function queries the remote block height from the AztecNode and compares it with the syncedToBlock value in the AccountState.
   * If the values are equal, then the AccountState is considered to be synchronised, otherwise not.
   *
   * @returns A boolean indicating whether the AccountState is synchronised with the remote block height or not.
   */
  public async isSynchronised() {
    const remoteBlockHeight = await this.node.getBlockHeight();
    return this.syncedToBlock === remoteBlockHeight;
  }

  /**
   * Get the latest synced block number for this account state.
   * The synced block number represents the highest block number that has been processed successfully
   * by the `AccountState` instance, ensuring that all transactions and associated data is up-to-date.
   *
   * @returns The latest synced block number.
   */
  public getSyncedToBlock() {
    return this.syncedToBlock;
  }

  /**
   * Process the given L2 block contexts and encrypted logs to update the account state.
   * It synchronizes the user's account by decrypting the encrypted logs and processing
   * the transactions and auxiliary data associated with them.
   * Throws an error if the number of block contexts and encrypted logs do not match.
   *
   * @param l2BlockContexts - An array of L2 block contexts to be processed.
   * @param encryptedL2BlockLogs - An array of encrypted logs associated with the L2 block contexts.
   * @returns A promise that resolves once the processing is completed.
   */
  public async process(l2BlockContexts: L2BlockContext[], encryptedL2BlockLogs: L2BlockL2Logs[]): Promise<void> {
    if (l2BlockContexts.length !== encryptedL2BlockLogs.length) {
      throw new Error(
        `Number of blocks and EncryptedLogs is not equal. Received ${l2BlockContexts.length} blocks, ${encryptedL2BlockLogs.length} encrypted logs.`,
      );
    }
    if (!l2BlockContexts.length) {
      return;
    }

    // TODO(Maddiaa): this calculation is brittle.
    // https://github.com/AztecProtocol/aztec-packages/issues/788
    let dataStartIndex =
      (l2BlockContexts[0].block.number - INITIAL_L2_BLOCK_NUM) * this.TXS_PER_BLOCK * MAX_NEW_COMMITMENTS_PER_TX;
    const blocksAndNoteSpendingInfo: ProcessedData[] = [];

    // Iterate over both blocks and encrypted logs.
    for (let blockIndex = 0; blockIndex < encryptedL2BlockLogs.length; ++blockIndex) {
      const { txLogs } = encryptedL2BlockLogs[blockIndex];
      let logIndexWithinBlock = 0;

      // We are using set for `userPertainingTxIndices` to avoid duplicates. This would happen in case there were
      // multiple encrypted logs in a tx pertaining to a user.
      const userPertainingTxIndices: Set<number> = new Set();
      const noteSpendingInfoDaos: NoteSpendingInfoDao[] = [];
      const privateKey = await this.keyStore.getAccountPrivateKey(this.publicKey);
      const curve = await Grumpkin.new();

      // Iterate over all the encrypted logs and try decrypting them. If successful, store the note spending info.
      for (let indexOfTxInABlock = 0; indexOfTxInABlock < txLogs.length; ++indexOfTxInABlock) {
        // Note: Each tx generates a `TxL2Logs` object and for this reason we can rely on its index corresponding
        //       to the index of a tx in a block.
        const txFunctionLogs = txLogs[indexOfTxInABlock].functionLogs;
        for (const functionLogs of txFunctionLogs) {
          for (const logs of functionLogs.logs) {
            const noteSpendingInfo = NoteSpendingInfo.fromEncryptedBuffer(logs, privateKey, curve);
            if (noteSpendingInfo) {
              // We have successfully decrypted the data.
              userPertainingTxIndices.add(indexOfTxInABlock);
              noteSpendingInfoDaos.push({
                ...noteSpendingInfo,
                nullifier: await this.computeNullifier(noteSpendingInfo),
                index: BigInt(dataStartIndex + logIndexWithinBlock),
                publicKey: this.publicKey,
              });
            }
            logIndexWithinBlock += 1;
          }
        }
      }

      blocksAndNoteSpendingInfo.push({
        blockContext: l2BlockContexts[blockIndex],
        userPertainingTxIndices: [...userPertainingTxIndices], // Convert set to array.
        noteSpendingInfoDaos,
      });
      dataStartIndex += txLogs.length;
    }

    await this.processBlocksAndNoteSpendingInfo(blocksAndNoteSpendingInfo);

    this.syncedToBlock = l2BlockContexts[l2BlockContexts.length - 1].block.number;
    this.log(`Synched block ${this.syncedToBlock}`);
  }

  /**
   * Compute the nullifier for a given transaction auxiliary data.
   * The nullifier is calculated using the private key of the account,
   * contract address, and note preimage associated with the noteSpendingInfo.
   * This method assists in identifying spent commitments in the private state.
   *
   * @param noteSpendingInfo - An instance of NoteSpendingInfo containing transaction details.
   * @returns A Fr instance representing the computed nullifier.
   */
  private async computeNullifier(noteSpendingInfo: NoteSpendingInfo) {
    const simulator = getAcirSimulator(this.db, this.node, this.node, this.node, this.keyStore);
    // TODO In the future, we'll need to simulate an unconstrained fn associated with the contract ABI and slot
    return Fr.fromBuffer(
      simulator.computeSiloedNullifier(
        noteSpendingInfo.contractAddress,
        noteSpendingInfo.storageSlot,
        noteSpendingInfo.notePreimage.items,
        await this.keyStore.getAccountPrivateKey(this.publicKey),
        await CircuitsWasm.get(),
      ),
    );
  }

  /**
   * Process the given blocks and their associated transaction auxiliary data.
   * This function updates the database with information about new transactions,
   * user-pertaining transaction indices, and auxiliary data. It also removes nullified
   * transaction auxiliary data from the database. This function keeps track of new nullifiers
   * and ensures all other transactions are updated with newly settled block information.
   *
   * @param blocksAndNoteSpendingInfo - Array of objects containing L2BlockContexts, user-pertaining transaction indices, and NoteSpendingInfoDaos.
   */
  private async processBlocksAndNoteSpendingInfo(blocksAndNoteSpendingInfo: ProcessedData[]) {
    const noteSpendingInfoDaosBatch: NoteSpendingInfoDao[] = [];
    const txDaos: TxDao[] = [];
    let newNullifiers: Fr[] = [];

    for (let i = 0; i < blocksAndNoteSpendingInfo.length; ++i) {
      const { blockContext, userPertainingTxIndices, noteSpendingInfoDaos } = blocksAndNoteSpendingInfo[i];

      // Process all the user pertaining txs.
      userPertainingTxIndices.map((txIndex, j) => {
        const txHash = blockContext.getTxHash(txIndex);
        this.log(`Processing tx ${txHash!.toString()} from block ${blockContext.block.number}`);
        const { newContractData } = blockContext.block.getTx(txIndex);
        const isContractDeployment = !newContractData[0].contractAddress.isZero();
        const noteSpendingInfo = noteSpendingInfoDaos[j];
        const contractAddress = isContractDeployment ? noteSpendingInfo.contractAddress : undefined;
        txDaos.push({
          txHash,
          blockHash: blockContext.getBlockHash(),
          blockNumber: blockContext.block.number,
          origin: this.address,
          contractAddress,
          error: '',
        });
      });
      noteSpendingInfoDaosBatch.push(...noteSpendingInfoDaos);

      newNullifiers = newNullifiers.concat(blockContext.block.newNullifiers);

      // Ensure all the other txs are updated with newly settled block info.
      await this.updateBlockInfoInBlockTxs(blockContext);
    }
    if (noteSpendingInfoDaosBatch.length) {
      await this.db.addNoteSpendingInfoBatch(noteSpendingInfoDaosBatch);
      noteSpendingInfoDaosBatch.forEach(noteSpendingInfo => {
        this.log(`Added note spending info with nullifier ${noteSpendingInfo.nullifier.toString()}}`);
      });
    }
    if (txDaos.length) await this.db.addTxs(txDaos);
    const removedNoteSpendingInfo = await this.db.removeNullifiedNoteSpendingInfo(newNullifiers, this.publicKey);
    removedNoteSpendingInfo.forEach(noteSpendingInfo => {
      this.log(`Removed note spending info with nullifier ${noteSpendingInfo.nullifier.toString()}}`);
    });
  }

  /**
   * Updates the block information for all transactions in a given block context.
   * The function retrieves transaction data objects from the database using their hashes,
   * sets the block hash and block number to the corresponding values, and saves the updated
   * transaction data back to the database. If a transaction is not found in the database,
   * an informational message is logged.
   *
   * @param blockContext - The L2BlockContext object containing the block information and related data.
   */
  private async updateBlockInfoInBlockTxs(blockContext: L2BlockContext) {
    for (const txHash of blockContext.getTxHashes()) {
      const txDao: TxDao | undefined = await this.db.getTx(txHash);
      if (txDao !== undefined) {
        txDao.blockHash = blockContext.getBlockHash();
        txDao.blockNumber = blockContext.block.number;
        await this.db.addTx(txDao);
        this.log(`Updated tx with hash ${txHash.toString()} from block ${blockContext.block.number}`);
      } else if (!txHash.isZero()) {
        this.log(`Tx with hash ${txHash.toString()} from block ${blockContext.block.number} not found in db`);
      }
    }
  }
}
