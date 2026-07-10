import type { EthAddress } from '@aztec/foundation/eth-address';

/** The coordinates that determine which physical store a logical store name maps to. */
export type StoreIdentity = {
  /** Chain ID of the L1 the rollup is deployed to. */
  l1ChainId: number;
  /** Address of the rollup contract the store's data pertains to. */
  rollupAddress: EthAddress;
  /** Schema version of the data held in the store. */
  schemaVersion: number;
};

/**
 * Composes the store-name discriminator for a store identity. Two identities map to the same physical store iff
 * their slugs are equal, so the format must stay stable: `<l1ChainId>-<rollupAddress>-v<schemaVersion>`.
 */
export function storeIdentitySlug({ l1ChainId, rollupAddress, schemaVersion }: StoreIdentity): string {
  return `${l1ChainId}-${rollupAddress.toString()}-v${schemaVersion}`;
}

/** Composes the physical store name for a logical store name and identity. */
export function effectiveStoreName(name: string, identity: StoreIdentity): string {
  return `${name}_${storeIdentitySlug(identity)}`;
}

/**
 * Thrown when a store's recorded identity does not match the identity it was opened under. Since the identity is
 * part of the physical store name, this can only indicate a store-naming bug; the store is left untouched.
 */
export class StoreIdentityMismatchError extends Error {
  constructor(
    public readonly storeName: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(
      `Store '${storeName}' records identity ${actual} but was opened as ${expected}. ` +
        `Refusing to open; data was NOT modified.`,
    );
    this.name = 'StoreIdentityMismatchError';
  }
}
