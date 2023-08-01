import { AztecAddress, CircuitsWasm, Fr } from '@aztec/circuits.js';
import { pedersenPlookupCommitInputs } from '@aztec/circuits.js/barretenberg';
import { AztecRPC } from '@aztec/types';

/**
 * A class that provides utility functions for interacting with the chain.
 */
export class CheatCodes {
  constructor(
    /**
     * The RPC client to use for interacting with the chain
     */
    public aztecRpc: AztecRPC,
    /**
     * The circuits wasm module used for pedersen hashing
     */
    public wasm: CircuitsWasm,
  ) {}

  static async create(aztecRpc: AztecRPC): Promise<CheatCodes> {
    return new CheatCodes(aztecRpc, await CircuitsWasm.get());
  }

  /**
   * Computes the slot value for a given map and key.
   * @param baseSlot - The base slot of the map (specified in noir contract)
   * @param key - The key to lookup in the map
   * @returns The storage slot of the value in the map
   */
  public computeSlotInMap(baseSlot: Fr | bigint, key: Fr | bigint): Fr {
    const mappingStorageSlot = typeof baseSlot === 'bigint' ? new Fr(baseSlot) : baseSlot;
    const frKey = typeof key === 'bigint' ? new Fr(key) : key;

    // Based on `at` function in
    // aztec3-packages/yarn-project/noir-contracts/src/contracts/noir-aztec/src/state_vars/map.nr
    return Fr.fromBuffer(
      pedersenPlookupCommitInputs(
        this.wasm,
        [mappingStorageSlot, frKey].map(f => f.toBuffer()),
      ),
    );
  }

  /**
   * Loads the value stored at the given slot in the public storage of the given contract.
   * @param who - The address of the contract
   * @param slot - The storage slot to lookup
   * @returns The value stored at the given slot
   */
  public async loadPublic(who: AztecAddress, slot: Fr | bigint): Promise<Fr> {
    const frSlot = typeof slot === 'bigint' ? new Fr(slot) : slot;
    const publicStorage = await this.aztecRpc.getPublicStorageAt(who, frSlot);
    return publicStorage ? Fr.fromBuffer(publicStorage) : Fr.ZERO;
  }
}
