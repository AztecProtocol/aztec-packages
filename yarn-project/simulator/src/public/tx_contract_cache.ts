import type { Fr } from '@aztec/foundation/fields';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassPublic, ContractInstanceWithAddress } from '@aztec/stdlib/contract';

/**
 * A cache for contract classes and instances for a single transaction.
 * Useful for tracking/retrieving contracts for a tx while leaving
 * the option to clear them if the tx is reverted.
 */
export class TxContractCache {
  private instanceCache = new Map<string, ContractInstanceWithAddress>();
  private classCache = new Map<string, ContractClassPublic>();

  /**
   * Add a contract instance to the cache
   */
  public addInstance(address: AztecAddress, instance: ContractInstanceWithAddress): void {
    this.instanceCache.set(address.toString(), instance);
  }

  /**
   * Add a contract class to the cache
   */
  public addClass(classId: Fr, contractClass: ContractClassPublic): void {
    this.classCache.set(classId.toString(), contractClass);
  }

  /**
   * Get a contract instance from the cache
   */
  public getInstance(address: AztecAddress): ContractInstanceWithAddress | undefined {
    return this.instanceCache.get(address.toString());
  }

  /**
   * Get a contract class from the cache
   */
  public getClass(classId: Fr): ContractClassPublic | undefined {
    return this.classCache.get(classId.toString());
  }

  /**
   * Check if the cache has a contract class
   */
  public hasClass(classId: Fr): boolean {
    return this.classCache.has(classId.toString());
  }

  /**
   * Clear all entries from the cache
   */
  public clear(): void {
    this.instanceCache.clear();
    this.classCache.clear();
  }

  /**
   * Merge another cache into this one
   */
  public mergeFrom(other: TxContractCache): void {
    other.instanceCache.forEach((value, key) => {
      this.instanceCache.set(key, value);
    });

    other.classCache.forEach((value, key) => {
      this.classCache.set(key, value);
    });
  }
}
