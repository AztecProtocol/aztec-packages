import { DasContextJs } from '@crate-crypto/node-eth-kzg';

export * from '@crate-crypto/node-eth-kzg';

let kzgInstance: DasContextJs | undefined;

/**
 * Returns the lazily-initialized KZG context.
 * The first call takes ~3 seconds to initialize the precomputation tables.
 */
export function getKzg(): DasContextJs {
  if (!kzgInstance) {
    kzgInstance = DasContextJs.create({ usePrecomp: true });
  }
  return kzgInstance;
}
