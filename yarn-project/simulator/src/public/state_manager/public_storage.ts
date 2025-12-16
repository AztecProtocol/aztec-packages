import { Fr } from '@aztec/foundation/fields';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { PublicStateDBInterface } from '../db_interfaces.js';

type PublicStorageReadResult = {
  value: Fr;
  cached: boolean;
};

/**
 * A class to manage public storage reads and writes during a contract call's AVM simulation.
 * Maintains a storage write cache, and ensures that reads fall back to the correct source.
 * When a contract call completes, its storage cache can be merged into its parent's.
 */
export class PublicStorage {
  /** Cached storage writes. */
  private readonly cache: PublicStorageCache;

  constructor(
    /** Reference to node storage. Checked on parent cache-miss. */
    private readonly hostPublicStorage: PublicStateDBInterface,
    /** Parent's storage. Checked on this' cache-miss. */
    private readonly parent?: PublicStorage,
  ) {
    this.cache = new PublicStorageCache();
  }

  /**
   * Create a new public storage manager forked from this one
   */
  public fork() {
    return new PublicStorage(this.hostPublicStorage, this);
  }

  /**
   * Read a storage value from this' cache or parent's (recursively).
   * DOES NOT CHECK HOST STORAGE!
   *
   * @param contractAddress - the address of the contract whose storage is being read from
   * @param slot - the slot in the contract's storage being read from
   * @returns value: the latest value written according to this cache or the parent's. undefined on cache miss.
   */
  public readHereOrParent(contractAddress: AztecAddress, slot: Fr): Fr | undefined {
    // First try check this storage cache
    let value = this.cache.read(contractAddress, slot);
    // Then try parent's storage cache
    if (!value && this.parent) {
      // Note: this will recurse to grandparent/etc until a cache-hit is encountered.
      value = this.parent.readHereOrParent(contractAddress, slot);
    }
    return value;
  }

  /**
   * Read a value from storage.
   * 1. Check cache.
   * 2. Check parent cache.
   * 3. Fall back to the host state.
   * 4. Not found! Value has never been written to before. Flag it as non-existent and return value zero.
   *
   * @param contractAddress - the address of the contract whose storage is being read from
   * @param slot - the slot in the contract's storage being read from
   * @returns exists: whether the slot has EVER been written to before, value: the latest value written to slot, or 0 if never written to before
   */
  public async read(contractAddress: AztecAddress, slot: Fr): Promise<PublicStorageReadResult> {
    let cached = false;
    // Check this cache and parent's (recursively)
    let value = this.readHereOrParent(contractAddress, slot);
    // Finally try the host's Aztec state (a trip to the database)
    if (!value) {
      // This functions returns Fr.ZERO if it has never been written to before
      // we explicity coalesce to Fr.ZERO in case we have some implementations that cause this to return undefined
      value = (await this.hostPublicStorage.storageRead(contractAddress, slot)) ?? Fr.ZERO;
      // TODO(dbanks12): if value retrieved from host storage, we can cache it here
      // any future reads to the same slot can read from cache instead of more expensive
      // DB access
    } else {
      cached = true;
    }
    // if value is Fr.ZERO here, it that means this slot has never been written to!
    return Promise.resolve({ value, cached });
  }

  /**
   * Stage a storage write.
   *
   * @param contractAddress - the address of the contract whose storage is being written to
   * @param slot - the slot in the contract's storage being written to
   * @param value - the value being written to the slot
   */
  public write(contractAddress: AztecAddress, slot: Fr, value: Fr) {
    this.cache.write(contractAddress, slot, value);
  }

  /**
   * Merges another PublicStorage's cache (pending writes) into this one.
   *
   * @param incomingPublicStorage - the incoming public storage to merge into this instance's
   */
  public acceptAndMerge(incomingPublicStorage: PublicStorage) {
    this.cache.acceptAndMerge(incomingPublicStorage.cache);
  }
}

/**
 * A class to cache writes to public storage during a contract call's AVM simulation.
 * "Writes" update a map, "reads" check that map or return undefined.
 * An instance of this class can merge another instance's staged writes into its own.
 */
class PublicStorageCache {
  /**
   * Map for staging storage writes.
   * One inner-map per contract storage address,
   * mapping storage slot to latest staged write value.
   */
  private cachePerContract: Map<bigint, Map<bigint, Fr>> = new Map();

  /**
   * Read a staged value from storage, if it has been previously written to.
   *
   * @param contractAddress - the address of the contract whose storage is being read from
   * @param slot - the slot in the contract's storage being read from
   * @returns the latest value written to slot, or undefined if no value has been written
   */
  public read(contractAddress: AztecAddress, slot: Fr): Fr | undefined {
    return this.cachePerContract.get(contractAddress.toBigInt())?.get(slot.toBigInt());
  }

  /**
   * Stage a storage write.
   *
   * @param contractAddress - the address of the contract whose storage is being written to
   * @param slot - the slot in the contract's storage being written to
   * @param value - the value being written to the slot
   */
  public write(contractAddress: AztecAddress, slot: Fr, value: Fr) {
    let cacheAtContract = this.cachePerContract.get(contractAddress.toBigInt());
    if (!cacheAtContract) {
      // If this contract's storage has no staged modifications, create a new inner map to store them
      cacheAtContract = new Map();
      this.cachePerContract.set(contractAddress.toBigInt(), cacheAtContract);
    }
    cacheAtContract.set(slot.toBigInt(), value);
  }

  /**
   * Merges another cache's staged writes into this instance's cache.
   *
   * Staged modifications in "incoming" take precedence over those
   * present in "this" as they are assumed to occur after this' writes.
   *
   * In practice, "this" is a parent call's storage cache, and "incoming" is a nested call's.
   *
   * @param incomingStorageCache - the incoming storage write cache to merge into this instance's
   */
  public acceptAndMerge(incomingStorageCache: PublicStorageCache) {
    // Iterate over all incoming contracts with staged writes.
    for (const [incomingAddress, incomingCacheAtContract] of incomingStorageCache.cachePerContract) {
      const thisCacheAtContract = this.cachePerContract.get(incomingAddress);
      if (!thisCacheAtContract) {
        // The contract has no storage writes staged here
        // so just accept the incoming cache as-is for this contract.
        this.cachePerContract.set(incomingAddress, incomingCacheAtContract);
      } else {
        // "Incoming" and "this" both have staged writes for this contract.
        // Merge in incoming staged writes, giving them precedence over this'.
        for (const [slot, value] of incomingCacheAtContract) {
          thisCacheAtContract.set(slot, value);
        }
      }
    }
  }
}
