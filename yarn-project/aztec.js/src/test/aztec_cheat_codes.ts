import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { deriveStorageSlotInMap } from '@aztec/stdlib/hash';
import { type AztecNode } from '@aztec/stdlib/interfaces/client';

/**
 * A class that provides utility functions for interacting with the aztec chain.
 */
export class AztecCheatCodes {
  constructor(
    /**
     * The node to use for interacting with the chain
     */
    private node: AztecNode,
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
    return res?.header.globalVariables.timestamp.toNumber() ?? 0;
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
}
