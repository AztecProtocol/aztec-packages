import { AztecAddress, Fr } from '@aztec/circuits.js';
import { Point } from '@aztec/foundation/fields';
import { NotePreimage } from '@aztec/types';

/**
 * Represents the data access object for auxiliary transaction data.
 * Contains properties from the decrypted note, computed properties, and information about
 * the public key used for encryption, as well as the location of the data in the tree.
 */
export interface NoteSpendingInfoDao {
  /**
   * The contract address this note is created in.
   */
  contractAddress: AztecAddress;
  /**
   * The specific storage location of the note on the contract.
   */
  storageSlot: Fr;
  /**
   * The preimage of the note, containing essential information about the note.
   */
  notePreimage: NotePreimage;
  /**
   * The nullifier of the note.
   */
  nullifier: Fr;
  /**
   * The location in the tree.
   */
  index: bigint;
  /**
   * The public key that was used to encrypt the data.
   */
  account: Point;
}
