import { type AztecAddress } from '@aztec/circuits.js/aztec-address';
import { deriveStorageSlotInMap } from '@aztec/circuits.js/hash';
import { type PXE } from '@aztec/circuits.js/interfaces/client';
import { type Note } from '@aztec/circuits.js/note';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';

/**
 * A class that provides utility functions for interacting with the aztec chain.
 */
export class AztecCheatCodes {
  constructor(
    /**
     * The PXE Service to use for interacting with the chain
     */
    public pxe: PXE,
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
    return await this.pxe.getBlockNumber();
  }

  /**
   * Get the current timestamp
   * @returns The current timestamp
   */
  public async timestamp(): Promise<number> {
    const res = await this.pxe.getBlock(await this.blockNumber());
    return res?.header.globalVariables.timestamp.toNumber() ?? 0;
  }

  /**
   * Loads the value stored at the given slot in the public storage of the given contract.
   * @param who - The address of the contract
   * @param slot - The storage slot to lookup
   * @returns The value stored at the given slot
   */
  public async loadPublic(who: AztecAddress, slot: Fr | bigint): Promise<Fr> {
    const storageValue = await this.pxe.getPublicStorageAt(who, new Fr(slot));
    return storageValue;
  }

  /**
   * Loads the value stored at the given slot in the private storage of the given contract.
   * @param contract - The address of the contract
   * @param owner - The owner for whom the notes are encrypted
   * @param slot - The storage slot to lookup
   * @returns The notes stored at the given slot
   */
  public async loadPrivate(owner: AztecAddress, contract: AztecAddress, slot: Fr | bigint): Promise<Note[]> {
    const extendedNotes = await this.pxe.getNotes({
      owner,
      contractAddress: contract,
      storageSlot: new Fr(slot),
    });
    return extendedNotes.map(extendedNote => extendedNote.note);
  }
}
