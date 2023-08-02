import { AztecAddress, CircuitsWasm, Fr } from '@aztec/circuits.js';
import { pedersenPlookupCommitInputs } from '@aztec/circuits.js/barretenberg';
import { AztecRPC } from '@aztec/types';

const toFr = (what: Fr | bigint): Fr => {
  return typeof what === 'bigint' ? new Fr(what) : what;
};

/**
 * A class that provides utility functions for interacting with the chain.
 */
export class CheatCodes {
  constructor(
    /**
     * The L2 cheat codes.
     */
    public l2: L2CheatCodes,
  ) {}

  static async create(aztecRpc: AztecRPC): Promise<CheatCodes> {
    const l2CheatCodes = new L2CheatCodes(aztecRpc, await CircuitsWasm.get());
    return new CheatCodes(l2CheatCodes);
  }
}

/**
 * A class that provides utility functions for interacting with the L1 chain.
 */
class L1CheatCodes {}

/**
 * A class that provides utility functions for interacting with the L2 chain.
 */
class L2CheatCodes {
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

  /**
   * Computes the slot value for a given map and key.
   * @param baseSlot - The base slot of the map (specified in noir contract)
   * @param key - The key to lookup in the map
   * @returns The storage slot of the value in the map
   */
  public computeSlotInMap(baseSlot: Fr | bigint, key: Fr | bigint): Fr {
    // Based on `at` function in
    // aztec3-packages/yarn-project/noir-contracts/src/contracts/noir-aztec/src/state_vars/map.nr
    return Fr.fromBuffer(
      pedersenPlookupCommitInputs(
        this.wasm,
        [toFr(baseSlot), toFr(key)].map(f => f.toBuffer()),
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
    const storageValue = await this.aztecRpc.getPublicStorageAt(who, toFr(slot));
    if (storageValue === undefined) {
      throw new Error(`Storage slot ${slot} not found`);
    }
    return Fr.fromBuffer(storageValue);
  }
}
