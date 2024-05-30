import {
  type AztecNode,
  type EncryptedNoteL2BlockL2Logs,
  L1NotePayload,
  type L2Block,
  TaggedNote,
} from '@aztec/circuit-types';
import { type NoteProcessorStats } from '@aztec/circuit-types/stats';
import { INITIAL_L2_BLOCK_NUM, MAX_NEW_NOTE_HASHES_PER_TX, type PublicKey } from '@aztec/circuits.js';
import { type Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { type KeyStore } from '@aztec/key-store';
import { ContractNotFoundError } from '@aztec/simulator';

import { DeferredNoteDao } from '../database/deferred_note_dao.js';
import { type PxeDatabase } from '../database/index.js';
import { type NoteDao } from '../database/note_dao.js';
import { getAcirSimulator } from '../simulator/index.js';
import { produceNoteDaos } from './produce_note_dao.js';

/**
 * Contains all the decrypted data in this array so that we can later batch insert it all into the database.
 */
interface ProcessedData {
  /**
   * Holds L2 block.
   */
  block: L2Block;
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
    /** The public counterpart to the secret key to be used in the decryption of incoming note logs. */
    public readonly ivpkM: PublicKey,
    /** The public counterpart to the secret key to be used in the decryption of outgoing note logs. */
    public readonly ovpkM: PublicKey,
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
    return this.db.getSynchedBlockNumberForPublicKey(this.ivpkM) ?? this.startingBlock - 1;
  }

  /**
   * Extracts new user-relevant notes from the information contained in the provided L2 blocks and encrypted logs.
   *
   * @throws If the number of blocks and encrypted logs do not match.
   * @param l2Blocks - L2 blocks to be processed.
   * @param encryptedL2BlockLogs - Encrypted logs associated with the L2 blocks.
   * @returns A promise that resolves once the processing is completed.
   */
  public async process(l2Blocks: L2Block[], encryptedL2BlockLogs: EncryptedNoteL2BlockL2Logs[]): Promise<void> {
    if (l2Blocks.length !== encryptedL2BlockLogs.length) {
      throw new Error(
        `Number of blocks and EncryptedLogs is not equal. Received ${l2Blocks.length} blocks, ${encryptedL2BlockLogs.length} encrypted logs.`,
      );
    }
    if (l2Blocks.length === 0) {
      return;
    }

    const blocksAndNotes: ProcessedData[] = [];
    // Keep track of notes that we couldn't process because the contract was not found.
    const deferredNoteDaosIncoming: DeferredNoteDao[] = [];
    const deferredNoteDaosOutgoing: DeferredNoteDao[] = [];

    const ivskM = await this.keyStore.getMasterSecretKey(this.ivpkM);
    const ovskM = await this.keyStore.getMasterSecretKey(this.ovpkM);

    // Iterate over both blocks and encrypted logs.
    for (let blockIndex = 0; blockIndex < encryptedL2BlockLogs.length; ++blockIndex) {
      this.stats.blocks++;
      const { txLogs } = encryptedL2BlockLogs[blockIndex];
      const block = l2Blocks[blockIndex];
      const dataStartIndexForBlock =
        block.header.state.partial.noteHashTree.nextAvailableLeafIndex -
        block.body.numberOfTxsIncludingPadded * MAX_NEW_NOTE_HASHES_PER_TX;

      // We are using set for `userPertainingTxIndices` to avoid duplicates. This would happen in case there were
      // multiple encrypted logs in a tx pertaining to a user.
      const noteDaosIncoming: NoteDao[] = [];
      const noteDaosOutgoing: NoteDao[] = [];

      // Iterate over all the encrypted logs and try decrypting them. If successful, store the note.
      for (let indexOfTxInABlock = 0; indexOfTxInABlock < txLogs.length; ++indexOfTxInABlock) {
        this.stats.txs++;
        const dataStartIndexForTx = dataStartIndexForBlock + indexOfTxInABlock * MAX_NEW_NOTE_HASHES_PER_TX;
        const newNoteHashes = block.body.txEffects[indexOfTxInABlock].noteHashes;
        // Note: Each tx generates a `TxL2Logs` object and for this reason we can rely on its index corresponding
        //       to the index of a tx in a block.
        const txFunctionLogs = txLogs[indexOfTxInABlock].functionLogs;
        const excludedIndices: Set<number> = new Set();
        for (const functionLogs of txFunctionLogs) {
          for (const log of functionLogs.logs) {
            this.stats.seen++;
            const { notePayload: incomingNotePayload } = TaggedNote.decryptAsIncoming(log.data, ivskM)!;
            const { notePayload: outgoingNotePayload } = TaggedNote.decryptAsOutgoing(log.data, ovskM)!;

            if (incomingNotePayload || outgoingNotePayload) {
              if (incomingNotePayload && outgoingNotePayload && !incomingNotePayload.equals(outgoingNotePayload)) {
                throw new Error('Incoming and outgoing note payloads do not match.');
              }

              const payload = incomingNotePayload || outgoingNotePayload;

              const txHash = block.body.txEffects[indexOfTxInABlock].txHash;
              const { incomingNoteDao, outgoingNoteDao, incomingDeferredNoteDao, outgoingDeferredNoteDao } =
                await produceNoteDaos(
                  this.simulator,
                  incomingNotePayload ? this.ivpkM : undefined,
                  outgoingNotePayload ? this.ovpkM : undefined,
                  payload,
                  txHash,
                  newNoteHashes,
                  dataStartIndexForTx,
                  excludedIndices,
                  this.log,
                );

              if (incomingNoteDao) {
                noteDaosIncoming.push(incomingNoteDao);
                this.stats.decrypted++;
              }
              if (outgoingNoteDao) {
                noteDaosOutgoing.push(outgoingNoteDao);
                this.stats.decrypted++;
              }
              if (incomingDeferredNoteDao) {
                deferredNoteDaosIncoming.push(incomingDeferredNoteDao);
                this.stats.deferred++;
              }
              if (outgoingDeferredNoteDao) {
                deferredNoteDaosOutgoing.push(outgoingDeferredNoteDao);
                this.stats.deferred++;
              }

              if (
                incomingNoteDao == undefined &&
                outgoingNoteDao == undefined &&
                incomingDeferredNoteDao == undefined &&
                outgoingDeferredNoteDao == undefined
              ) {
                this.stats.failed++;
              }
            }
          }
        }
      }

      blocksAndNotes.push({
        block: l2Blocks[blockIndex],
        noteDaos: noteDaosIncoming,
      });
    }

    await this.processBlocksAndNotes(blocksAndNotes);
    await this.processDeferredNotes(deferredNoteDaosIncoming);

    const syncedToBlock = l2Blocks[l2Blocks.length - 1].number;
    await this.db.setSynchedBlockNumberForPublicKey(this.ivpkM, syncedToBlock);

    this.log.debug(`Synched block ${syncedToBlock}`);
  }

  /**
   * Process the given blocks and their associated transaction auxiliary data.
   * This function updates the database with information about new transactions,
   * user-pertaining transaction indices, and auxiliary data. It also removes nullified
   * transaction auxiliary data from the database. This function keeps track of new nullifiers
   * and ensures all other transactions are updated with newly settled block information.
   *
   * @param blocksAndNotes - Array of objects containing L2 blocks, user-pertaining transaction indices, and NoteDaos.
   */
  private async processBlocksAndNotes(blocksAndNotes: ProcessedData[]) {
    const noteDaos = blocksAndNotes.flatMap(b => b.noteDaos);
    if (noteDaos.length) {
      await this.db.addNotes(noteDaos);
      noteDaos.forEach(noteDao => {
        this.log.verbose(
          `Added note for contract ${noteDao.contractAddress} at slot ${
            noteDao.storageSlot
          } with nullifier ${noteDao.siloedNullifier.toString()}`,
        );
      });
    }

    const newNullifiers: Fr[] = blocksAndNotes.flatMap(b =>
      b.block.body.txEffects.flatMap(txEffect => txEffect.nullifiers),
    );
    const removedNotes = await this.db.removeNullifiedNotes(newNullifiers, this.ivpkM);
    removedNotes.forEach(noteDao => {
      this.log.verbose(
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
        this.log.verbose(
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
  public async decodeDeferredNotes(
    deferredNoteDaos: DeferredNoteDao[],
  ): Promise<{ incomingNoteDaos: NoteDao[]; outgoingNoteDaos: NoteDao[] }> {
    const excludedIndices: Set<number> = new Set();
    const incomingNoteDaos: NoteDao[] = [];
    const outgoingNoteDaos: NoteDao[] = [];

    for (const deferredNote of deferredNoteDaos) {
      const { publicKey, note, contractAddress, storageSlot, noteTypeId, txHash, newNoteHashes, dataStartIndexForTx } =
        deferredNote;
      const payload = new L1NotePayload(note, contractAddress, storageSlot, noteTypeId);

      const isIncoming = publicKey.equals(this.ivpkM);
      const isOutgoing = publicKey.equals(this.ovpkM);

      if (!isIncoming && !isOutgoing) {
        throw new Error('Public key does not match ivpkM or ovpkM');
      }

      const { incomingNoteDao, outgoingNoteDao } = await produceNoteDaos(
        this.simulator,
        isIncoming ? this.ivpkM : undefined,
        isOutgoing ? this.ovpkM : undefined,
        payload,
        txHash,
        newNoteHashes,
        dataStartIndexForTx,
        excludedIndices,
        this.log,
      );

      if (incomingNoteDao) {
        incomingNoteDaos.push(incomingNoteDao);
        this.stats.decrypted++;
      }
      if (outgoingNoteDao) {
        outgoingNoteDaos.push(outgoingNoteDao);
        this.stats.decrypted++;
      }
    }

    return { incomingNoteDaos, outgoingNoteDaos };
  }
}
