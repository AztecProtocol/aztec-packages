import { type AztecNode, L1NotePayload, type L2Block } from '@aztec/circuit-types';
import { type NoteProcessorStats } from '@aztec/circuit-types/stats';
import {
  type CompleteAddress,
  INITIAL_L2_BLOCK_NUM,
  MAX_NOTE_HASHES_PER_TX,
  computeAddressSecret,
  computePoint,
} from '@aztec/circuits.js';
import { type Fr } from '@aztec/foundation/fields';
import { type Logger, createDebugLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { type KeyStore } from '@aztec/key-store';
import { type AcirSimulator } from '@aztec/simulator';

import { type DeferredNoteDao } from '../database/deferred_note_dao.js';
import { type IncomingNoteDao } from '../database/incoming_note_dao.js';
import { type PxeDatabase } from '../database/index.js';
import { type OutgoingNoteDao } from '../database/outgoing_note_dao.js';
import { getAcirSimulator } from '../simulator/index.js';
import { produceNoteDaos } from './utils/produce_note_daos.js';

/**
 * Contains all the decrypted data in this array so that we can later batch insert it all into the database.
 */
interface ProcessedData {
  /** Holds L2 block. */
  block: L2Block;
  /** DAOs of processed incoming notes. */
  incomingNotes: IncomingNoteDao[];
  /** DAOs of processed outgoing notes. */
  outgoingNotes: OutgoingNoteDao[];
}

/**
 * NoteProcessor is responsible for decrypting logs and converting them to notes via their originating contracts
 * before storing them against their owner.
 */
export class NoteProcessor {
  /** Keeps track of processing time since an instance is created. */
  public readonly timer: Timer = new Timer();

  /** Stats accumulated for this processor. */
  public readonly stats: NoteProcessorStats = {
    seen: 0,
    decryptedIncoming: 0,
    decryptedOutgoing: 0,
    deferredIncoming: 0,
    deferredOutgoing: 0,
    failed: 0,
    blocks: 0,
    txs: 0,
  };

  private constructor(
    public readonly account: CompleteAddress,
    private keyStore: KeyStore,
    private db: PxeDatabase,
    private node: AztecNode,
    private startingBlock: number,
    private simulator: AcirSimulator,
    private log: Logger,
  ) {}

  public static create(
    account: CompleteAddress,
    keyStore: KeyStore,
    db: PxeDatabase,
    node: AztecNode,
    startingBlock: number = INITIAL_L2_BLOCK_NUM,
    simulator = getAcirSimulator(db, node, keyStore),
    log = createDebugLogger('aztec:note_processor'),
  ) {
    return new NoteProcessor(account, keyStore, db, node, startingBlock, simulator, log);
  }

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
    return this.db.getSynchedBlockNumberForAccount(this.account.address) ?? this.startingBlock - 1;
  }

  /**
   * Extracts new user-relevant notes from the information contained in the provided L2 blocks and encrypted logs.
   *
   * @param blocks - L2 blocks to be processed.
   * @returns A promise that resolves once the processing is completed.
   */
  public async process(blocks: L2Block[]): Promise<void> {
    if (blocks.length === 0) {
      return;
    }

    const blocksAndNotes: ProcessedData[] = [];
    // Keep track of notes that we couldn't process because the contract was not found.
    const deferredIncomingNotes: DeferredNoteDao[] = [];
    const deferredOutgoingNotes: DeferredNoteDao[] = [];

    const ivskM = await this.keyStore.getMasterSecretKey(this.account.publicKeys.masterIncomingViewingPublicKey);
    const addressSecret = computeAddressSecret(this.account.getPreaddress(), ivskM);

    const ovskM = await this.keyStore.getMasterSecretKey(this.account.publicKeys.masterOutgoingViewingPublicKey);

    // Iterate over both blocks and encrypted logs.
    for (const block of blocks) {
      this.stats.blocks++;
      const { txLogs: encryptedTxLogs } = block.body.noteEncryptedLogs;
      const { txLogs: unencryptedTxLogs } = block.body.unencryptedLogs;

      const dataStartIndexForBlock =
        block.header.state.partial.noteHashTree.nextAvailableLeafIndex -
        block.body.numberOfTxsIncludingPadded * MAX_NOTE_HASHES_PER_TX;

      // We are using set for `userPertainingTxIndices` to avoid duplicates. This would happen in case there were
      // multiple encrypted logs in a tx pertaining to a user.
      const incomingNotes: IncomingNoteDao[] = [];
      const outgoingNotes: OutgoingNoteDao[] = [];

      // Iterate over all the encrypted logs and try decrypting them. If successful, store the note.
      for (let indexOfTxInABlock = 0; indexOfTxInABlock < encryptedTxLogs.length; ++indexOfTxInABlock) {
        this.stats.txs++;
        const dataStartIndexForTx = dataStartIndexForBlock + indexOfTxInABlock * MAX_NOTE_HASHES_PER_TX;
        const noteHashes = block.body.txEffects[indexOfTxInABlock].noteHashes;
        // Note: Each tx generates a `TxL2Logs` object and for this reason we can rely on its index corresponding
        //       to the index of a tx in a block.
        const encryptedTxFunctionLogs = encryptedTxLogs[indexOfTxInABlock].functionLogs;
        const unencryptedTxFunctionLogs = unencryptedTxLogs[indexOfTxInABlock].functionLogs;
        const excludedIndices: Set<number> = new Set();

        // We iterate over both encrypted and unencrypted logs to decrypt the notes since partial notes are passed
        // via the unencrypted logs stream.
        for (const txFunctionLogs of [encryptedTxFunctionLogs, unencryptedTxFunctionLogs]) {
          for (const functionLogs of txFunctionLogs) {
            for (const unprocessedLog of functionLogs.logs) {
              this.stats.seen++;
              const incomingNotePayload = L1NotePayload.decryptAsIncoming(unprocessedLog.data, addressSecret);
              const outgoingNotePayload = L1NotePayload.decryptAsOutgoing(unprocessedLog.data, ovskM);

              if (incomingNotePayload || outgoingNotePayload) {
                if (incomingNotePayload && outgoingNotePayload && !incomingNotePayload.equals(outgoingNotePayload)) {
                  throw new Error(
                    `Incoming and outgoing note payloads do not match. Incoming: ${JSON.stringify(
                      incomingNotePayload,
                    )}, Outgoing: ${JSON.stringify(outgoingNotePayload)}`,
                  );
                }

                const payload = incomingNotePayload || outgoingNotePayload;

                const txEffect = block.body.txEffects[indexOfTxInABlock];
                const { incomingNote, outgoingNote, incomingDeferredNote, outgoingDeferredNote } =
                  await produceNoteDaos(
                    this.simulator,
                    this.db,
                    incomingNotePayload ? computePoint(this.account.address) : undefined,
                    outgoingNotePayload ? this.account.publicKeys.masterOutgoingViewingPublicKey : undefined,
                    payload!,
                    txEffect.txHash,
                    noteHashes,
                    dataStartIndexForTx,
                    excludedIndices,
                    this.log,
                    txEffect.unencryptedLogs,
                  );

                if (incomingNote) {
                  incomingNotes.push(incomingNote);
                  this.stats.decryptedIncoming++;
                }
                if (outgoingNote) {
                  outgoingNotes.push(outgoingNote);
                  this.stats.decryptedOutgoing++;
                }
                if (incomingDeferredNote) {
                  deferredIncomingNotes.push(incomingDeferredNote);
                  this.stats.deferredIncoming++;
                }
                if (outgoingDeferredNote) {
                  deferredOutgoingNotes.push(outgoingDeferredNote);
                  this.stats.deferredOutgoing++;
                }

                if (incomingNote == undefined && outgoingNote == undefined && incomingDeferredNote == undefined) {
                  this.stats.failed++;
                }
              }
            }
          }
        }
      }

      blocksAndNotes.push({
        block,
        incomingNotes,
        outgoingNotes,
      });
    }

    await this.processBlocksAndNotes(blocksAndNotes);
    await this.processDeferredNotes(deferredIncomingNotes, deferredOutgoingNotes);

    const syncedToBlock = blocks[blocks.length - 1].number;
    await this.db.setSynchedBlockNumberForAccount(this.account.address, syncedToBlock);

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
    const incomingNotes = blocksAndNotes.flatMap(b => b.incomingNotes);
    const outgoingNotes = blocksAndNotes.flatMap(b => b.outgoingNotes);
    if (incomingNotes.length || outgoingNotes.length) {
      await this.db.addNotes(incomingNotes, outgoingNotes, this.account.address);
      incomingNotes.forEach(noteDao => {
        this.log.verbose(
          `Added incoming note for contract ${noteDao.contractAddress} at slot ${
            noteDao.storageSlot
          } with nullifier ${noteDao.siloedNullifier.toString()}`,
        );
      });
      outgoingNotes.forEach(noteDao => {
        this.log.verbose(`Added outgoing note for contract ${noteDao.contractAddress} at slot ${noteDao.storageSlot}`);
      });
    }

    const nullifiers: Fr[] = blocksAndNotes.flatMap(b =>
      b.block.body.txEffects.flatMap(txEffect => txEffect.nullifiers),
    );
    const removedNotes = await this.db.removeNullifiedNotes(nullifiers, computePoint(this.account.address));
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
   * @param deferredIncomingNotes - incoming notes that are intended for us but we couldn't process because the contract was not found.
   * @param deferredOutgoingNotes - outgoing notes that we couldn't process because the contract was not found.
   */
  private async processDeferredNotes(
    deferredIncomingNotes: DeferredNoteDao[],
    deferredOutgoingNotes: DeferredNoteDao[],
  ) {
    if (deferredIncomingNotes.length || deferredOutgoingNotes.length) {
      await this.db.addDeferredNotes([...deferredIncomingNotes, ...deferredOutgoingNotes]);
      deferredIncomingNotes.forEach(noteDao => {
        this.log.verbose(
          `Deferred incoming note for contract ${noteDao.payload.contractAddress} at slot ${
            noteDao.payload.storageSlot
          } in tx ${noteDao.txHash.toString()}`,
        );
      });
      deferredOutgoingNotes.forEach(noteDao => {
        this.log.verbose(
          `Deferred outgoing note for contract ${noteDao.payload.contractAddress} at slot ${
            noteDao.payload.storageSlot
          } in tx ${noteDao.txHash.toString()}`,
        );
      });
    }
  }

  /**
   * Retry decoding the given deferred notes because we now have the contract code.
   *
   * @param deferredNoteDaos - notes that we have previously deferred because the contract was not found
   * @returns An object containing arrays of incoming and outgoing notes that were successfully decoded.
   *
   * @remarks Caller is responsible for making sure that we have the contract for the
   * deferred notes provided: we will not retry notes that fail again.
   */
  public async decodeDeferredNotes(deferredNoteDaos: DeferredNoteDao[]): Promise<{
    incomingNotes: IncomingNoteDao[];
    outgoingNotes: OutgoingNoteDao[];
  }> {
    const excludedIndices: Set<number> = new Set();
    const incomingNotes: IncomingNoteDao[] = [];
    const outgoingNotes: OutgoingNoteDao[] = [];

    for (const deferredNote of deferredNoteDaos) {
      const { publicKey, payload, txHash, noteHashes, dataStartIndexForTx, unencryptedLogs } = deferredNote;

      const isIncoming = publicKey.equals(computePoint(this.account.address));
      const isOutgoing = publicKey.equals(this.account.publicKeys.masterOutgoingViewingPublicKey);

      if (!isIncoming && !isOutgoing) {
        // The note does not belong to this note processor
        continue;
      }

      const { incomingNote, outgoingNote } = await produceNoteDaos(
        this.simulator,
        this.db,
        isIncoming ? computePoint(this.account.address) : undefined,
        isOutgoing ? this.account.publicKeys.masterOutgoingViewingPublicKey : undefined,
        payload,
        txHash,
        noteHashes,
        dataStartIndexForTx,
        excludedIndices,
        this.log,
        unencryptedLogs,
      );

      if (isIncoming) {
        if (!incomingNote) {
          throw new Error('Deferred incoming note could not be decoded');
        }
        incomingNotes.push(incomingNote);
        this.stats.decryptedIncoming++;
      }
      if (outgoingNote) {
        if (!outgoingNote) {
          throw new Error('Deferred outgoing note could not be decoded');
        }
        outgoingNotes.push(outgoingNote);
        this.stats.decryptedOutgoing++;
      }
    }

    return { incomingNotes, outgoingNotes };
  }
}
