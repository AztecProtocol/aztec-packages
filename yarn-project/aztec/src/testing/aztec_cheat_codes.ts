import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { deriveStorageSlotInMap } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { Note, NotesFilter, UniqueNote } from '@aztec/stdlib/note';

/**
 * A class that provides utility functions for interacting with the aztec chain.
 */
export class AztecCheatCodes {
  constructor(
    /**
     * The test wallet or pxe to use for getting notes
     */
    public testWalletOrPxe: { getNotes(filter: NotesFilter): Promise<UniqueNote[]> },
    /**
     * The Aztec Node to use for interacting with the chain
     */
    public node: AztecNode,
    /**
     * The logger to use for the aztec cheatcodes
     */
    public logger = createLogger('aztecjs:cheat_codes'),
  ) {}

  /**
   * Computes the slot value for a given map and key.
   * @param mapSlot - The slot of the map (specified in Aztec.nr contract)
   * @param key - The key to lookup in the map
   * @returns The storage slot of the value in the map
   */
  public computeSlotInMap(mapSlot: Fr | bigint, key: Fr | bigint | AztecAddress): Promise<Fr> {
    const keyFr = typeof key === 'bigint' ? new Fr(key) : key.toField();
    return deriveStorageSlotInMap(mapSlot, keyFr);
  }

  /**
   * Get the current blocknumber
   * @returns The current block number
   */
  public async blockNumber(): Promise<number> {
    return await this.node.getBlockNumber();
  }

  /**
   * Get the current timestamp
   * @returns The current timestamp
   */
  public async timestamp(): Promise<number> {
    const res = await this.node.getBlock(await this.blockNumber());
    return Number(res?.header.globalVariables.timestamp ?? 0);
  }

  /**
   * Loads the value stored at the given slot in the public storage of the given contract.
   * @param who - The address of the contract
   * @param slot - The storage slot to lookup
   * @returns The value stored at the given slot
   */
  public async loadPublic(who: AztecAddress, slot: Fr | bigint): Promise<Fr> {
    const storageValue = await this.node.getPublicStorageAt('latest', who, new Fr(slot));
    return storageValue;
  }

  /**
   * Loads the value stored at the given slot in the private storage of the given contract.
   * @param contract - The address of the contract
   * @param recipient - The address whose public key was used to encrypt the note
   * @param slot - The storage slot to lookup
   * @returns The notes stored at the given slot
   */
  public async loadPrivate(recipient: AztecAddress, contract: AztecAddress, slot: Fr | bigint): Promise<Note[]> {
    const extendedNotes = await this.testWalletOrPxe.getNotes({
      recipient,
      contractAddress: contract,
      storageSlot: new Fr(slot),
    });
    return extendedNotes.map(extendedNote => extendedNote.note);
  }
}
