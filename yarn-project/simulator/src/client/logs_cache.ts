import { type EncryptedL2Log, type UnencryptedL2Log } from '@aztec/circuit-types';

/**
 * Log data that's accessible by all the function calls in an execution.
 * This class exists to:
 * 1. Keep track of logs emitted through nested calls in the correct order.
 * 2. TODO(1641): Remove encrypted logs based on notes nullified in the same scope.
 */
export class LogsCache {
  /**
   * Logs notes created in this transaction.
   */
  private encryptedLogs: EncryptedL2Log[] = [];
  private unencryptedLogs: UnencryptedL2Log[] = [];

  // TODO Separate encrypted logs linked to note hashes and arbitrary logs:

  // Maps from note hash to encrypted log - useful for removing transient logs
  // private encryptedLogsLinkedToNotes: Map<bigint, EncryptedL2Log> = new Map();

  // /**
  //  * Remove the encrypted log for a nullified note.
  //  * @param innerNoteHash - Inner note hash of the note. If this value equals 0, it means the
  //  * note being nullified is from a previous transaction (and thus not a new note).
  //  */
  // public nullifyNote(innerNoteHash: Fr) {
  //   if (!innerNoteHash.equals(Fr.ZERO)) {
  //     // Find and remove the matching new note if the emitted innerNoteHash is not empty.
  //     const log = this.encryptedLogsLinkedToNotes.get(innerNoteHash.toBigInt()) ?? false;
  //     // TODO: throw here? Will the log always be here?
  //     if (!log) {
  //       throw new Error('Attempt to remove a pending note log that does not exist.');
  //     }
  //     this.encryptedLogsLinkedToNotes.delete(innerNoteHash.toBigInt());
  //   }
  // }

  /**
   * Add a new encrypted log to cache.
   * @param log - New log created during execution.
   */
  public addEncryptedLog(log: EncryptedL2Log) {
    this.encryptedLogs.push(log);
  }

  /**
   * Add a new unencrypted log to cache.
   * @param log - New log created during execution.
   */
  public addUnencryptedLog(log: UnencryptedL2Log) {
    this.unencryptedLogs.push(log);
  }

  /**
   * Return the encrypted logs.
   */
  public getEncryptedLogs() {
    return this.encryptedLogs;
  }

  /**
   * Return the encrypted logs.
   */
  public getUnencryptedLogs() {
    return this.unencryptedLogs;
  }
}
