import {
  AztecNode,
  INITIAL_L2_BLOCK_NUM,
  KeyStore,
  L1NotePayload,
  L2BlockContext,
  L2BlockL2Logs,
} from '@aztec/circuit-types';
import { NoteProcessorStats } from '@aztec/circuit-types/stats';
import { MAX_NEW_COMMITMENTS_PER_TX, PublicKey } from '@aztec/circuits.js';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { ContractNotFoundError } from '@aztec/simulator';

import { DeferredNoteDao } from '../database/deferred_note_dao.js';
import { PxeDatabase } from '../database/index.js';
import { NoteDao } from '../database/note_dao.js';
import { getAcirSimulator } from '../simulator/index.js';
import { produceNoteDao } from './produce_note_dao.js';

/**
 * Contains all the decrypted data in this array so that we can later batch insert it all into the database.
 */
interface ProcessedData {
  /**
   * Holds L2 block and a cache of already requested tx hashes.
   */
  blockContext: L2BlockContext;
  /**
   * DAOs of processed notes.
   */
  noteDaos: NoteDao[];
}

/**
 * NoteProcessor is responsible for decrypting logs and converting them to notes via their originating contracts
 * before storing them against their owner.
 */
export class NoteProcessor {
  /** Keeps track of processing time since an instance is created. */
  public readonly timer: Timer = new Timer();

  /** Stats accumulated for this processor. */
  public readonly stats: NoteProcessorStats = { seen: 0, decrypted: 0, deferred: 0, failed: 0, blocks: 0, txs: 0 };

  constructor(
    /**
     * The public counterpart to the private key to be used in note decryption.
     */
    public readonly publicKey: PublicKey,
    private keyStore: KeyStore,
    private db: PxeDatabase,
    private node: AztecNode,
    private startingBlock: number = INITIAL_L2_BLOCK_NUM,
    private simulator = getAcirSimulator(db, node, keyStore),
    private log = createDebugLogger('aztec:note_processor'),
  ) {}

  /**
   * Check if the NoteProcessor is synchronized with the remote block number.
   * The function queries the remote block number from the AztecNode and compares it with the syncedToBlock value in the NoteProcessor.
   * If the values are equal, then the NoteProcessor is considered to be synchronized, otherwise not.
   *
   * @returns A boolean indicating whether the NoteProcessor is synchronized with the remote block number or not.
   */
  public async isSynchronized() {
    const remoteBlockNumber = await this.node.getBlockNumber();
    return this.getSyncedToBlock() === remoteBlockNumber;
  }

  /**
   * Returns synchronization status (ie up to which block has been synced ) for this note processor.
   */
  public get status() {
    return { syncedToBlock: this.getSyncedToBlock() };
  }

  private getSyncedToBlock(): number {
    return this.db.getSynchedBlockNumberForPublicKey(this.publicKey) ?? this.startingBlock - 1;
  }

  /**
   * Process the given L2 block contexts and encrypted logs to update the note processor.
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

    const curve = new Grumpkin();
    const blocksAndNotes: ProcessedData[] = [];
    // Keep track of notes that we couldn't process because the contract was not found.
    const deferredNoteDaos: DeferredNoteDao[] = [];

    // Iterate over both blocks and encrypted logs.
    for (let blockIndex = 0; blockIndex < encryptedL2BlockLogs.length; ++blockIndex) {
      this.stats.blocks++;
      const { txLogs } = encryptedL2BlockLogs[blockIndex];
      const blockContext = l2BlockContexts[blockIndex];
      const block = blockContext.block;
      const dataEndIndexForBlock = block.header.state.partial.noteHashTree.nextAvailableLeafIndex;

      // We are using set for `userPertainingTxIndices` to avoid duplicates. This would happen in case there were
      // multiple encrypted logs in a tx pertaining to a user.
      const noteDaos: NoteDao[] = [];
      const privateKey = await this.keyStore.getAccountPrivateKey(this.publicKey);

      // Iterate over all the encrypted logs and try decrypting them. If successful, store the note.
      for (let indexOfTxInABlock = 0; indexOfTxInABlock < txLogs.length; ++indexOfTxInABlock) {
        this.stats.txs++;
        const dataStartIndexForTx =
          dataEndIndexForBlock - (txLogs.length - indexOfTxInABlock) * MAX_NEW_COMMITMENTS_PER_TX;
        const newCommitments = block.body.txEffects[indexOfTxInABlock].newNoteHashes;
        // Note: Each tx generates a `TxL2Logs` object and for this reason we can rely on its index corresponding
        //       to the index of a tx in a block.
        const txFunctionLogs = txLogs[indexOfTxInABlock].functionLogs;
        const excludedIndices: Set<number> = new Set();
        for (const functionLogs of txFunctionLogs) {
          for (const logs of functionLogs.logs) {
            this.stats.seen++;
            const payload = L1NotePayload.fromEncryptedBuffer(logs, privateKey, curve);
            if (payload) {
              // We have successfully decrypted the data.
              const txHash = blockContext.getTxHash(indexOfTxInABlock);
              try {
                const noteDao = await produceNoteDao(
                  this.simulator,
                  this.publicKey,
                  payload,
                  txHash,
                  newCommitments,
                  dataStartIndexForTx,
                  excludedIndices,
                );
                noteDaos.push(noteDao);
                this.stats.decrypted++;
              } catch (e) {
                if (e instanceof ContractNotFoundError) {
                  this.stats.deferred++;
                  this.log.warn(e.message);
                  const deferredNoteDao = new DeferredNoteDao(
                    this.publicKey,
                    payload.note,
                    payload.contractAddress,
                    payload.storageSlot,
                    payload.noteTypeId,
                    txHash,
                    newCommitments,
                    dataStartIndexForTx,
                  );
                  deferredNoteDaos.push(deferredNoteDao);
                } else {
                  this.stats.failed++;
                  this.log.warn(`Could not process note because of "${e}". Discarding note...`);
                }
              }
            }
          }
        }
      }

      blocksAndNotes.push({
        blockContext: l2BlockContexts[blockIndex],
        noteDaos,
      });
    }

    await this.processBlocksAndNotes(blocksAndNotes);
    await this.processDeferredNotes(deferredNoteDaos);

    const syncedToBlock = l2BlockContexts[l2BlockContexts.length - 1].block.number;
    await this.db.setSynchedBlockNumberForPublicKey(this.publicKey, syncedToBlock);

    this.log(`Synched block ${syncedToBlock}`);
  }

  /**
   * Process the given blocks and their associated transaction auxiliary data.
   * This function updates the database with information about new transactions,
   * user-pertaining transaction indices, and auxiliary data. It also removes nullified
   * transaction auxiliary data from the database. This function keeps track of new nullifiers
   * and ensures all other transactions are updated with newly settled block information.
   *
   * @param blocksAndNotes - Array of objects containing L2BlockContexts, user-pertaining transaction indices, and NoteDaos.
   */
  private async processBlocksAndNotes(blocksAndNotes: ProcessedData[]) {
    const noteDaos = blocksAndNotes.flatMap(b => b.noteDaos);
    if (noteDaos.length) {
      await this.db.addNotes(noteDaos);
      noteDaos.forEach(noteDao => {
        this.log(
          `Added note for contract ${noteDao.contractAddress} at slot ${
            noteDao.storageSlot
          } with nullifier ${noteDao.siloedNullifier.toString()}`,
        );
      });
    }

    const newNullifiers: Fr[] = blocksAndNotes.flatMap(b =>
      b.blockContext.block.body.txEffects.flatMap(txEffect => txEffect.newNullifiers),
    );
    const removedNotes = await this.db.removeNullifiedNotes(newNullifiers, this.publicKey);
    removedNotes.forEach(noteDao => {
      this.log(
        `Removed note for contract ${noteDao.contractAddress} at slot ${
          noteDao.storageSlot
        } with nullifier ${noteDao.siloedNullifier.toString()}`,
      );
    });
  }

  /**
   * Store the given deferred notes in the database for later decoding.
   *
   * @param deferredNoteDaos - notes that are intended for us but we couldn't process because the contract was not found.
   */
  private async processDeferredNotes(deferredNoteDaos: DeferredNoteDao[]) {
    if (deferredNoteDaos.length) {
      await this.db.addDeferredNotes(deferredNoteDaos);
      deferredNoteDaos.forEach(noteDao => {
        this.log(
          `Deferred note for contract ${noteDao.contractAddress} at slot ${
            noteDao.storageSlot
          } in tx ${noteDao.txHash.toString()}`,
        );
      });
    }
  }

  /**
   * Retry decoding the given deferred notes because we now have the contract code.
   *
   * @param deferredNoteDaos - notes that we have previously deferred because the contract was not found
   * @returns An array of NoteDaos that were successfully decoded.
   *
   * @remarks Caller is responsible for making sure that we have the contract for the
   * deferred notes provided: we will not retry notes that fail again.
   */
  public async decodeDeferredNotes(deferredNoteDaos: DeferredNoteDao[]): Promise<NoteDao[]> {
    const excludedIndices: Set<number> = new Set();
    const noteDaos: NoteDao[] = [];
    for (const deferredNote of deferredNoteDaos) {
      const { note, contractAddress, storageSlot, noteTypeId, txHash, newCommitments, dataStartIndexForTx } =
        deferredNote;
      const payload = new L1NotePayload(note, contractAddress, storageSlot, noteTypeId);

      try {
        const noteDao = await produceNoteDao(
          this.simulator,
          this.publicKey,
          payload,
          txHash,
          newCommitments,
          dataStartIndexForTx,
          excludedIndices,
        );
        noteDaos.push(noteDao);
        this.stats.decrypted++;
      } catch (e) {
        this.stats.failed++;
        this.log.warn(`Could not process deferred note because of "${e}". Discarding note...`);
      }
    }

    return noteDaos;
  }
}
