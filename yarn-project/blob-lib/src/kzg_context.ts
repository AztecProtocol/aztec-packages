import type { DasContextJs } from '@crate-crypto/node-eth-kzg';
import { createRequire } from 'module';

// Re-export the type only. The native module is loaded lazily to avoid
// creating a napi-rs CustomGC handle at import time, which keeps the
// Node.js event loop alive and can deadlock process.exit().
export type { DasContextJs } from '@crate-crypto/node-eth-kzg';

let nativeModule: typeof import('@crate-crypto/node-eth-kzg') | undefined;

/** Lazily loads the @crate-crypto/node-eth-kzg native module. */
function loadNativeModule(): typeof import('@crate-crypto/node-eth-kzg') {
  if (!nativeModule) {
    const require = createRequire(import.meta.url);
    nativeModule = require('@crate-crypto/node-eth-kzg') as typeof import('@crate-crypto/node-eth-kzg');
  }
  return nativeModule!;
}

// Ethereum blob constants, loaded lazily from the native module.
// Values: BYTES_PER_BLOB=131072, BYTES_PER_COMMITMENT=48
export function getBytesPerBlob(): number {
  return loadNativeModule().BYTES_PER_BLOB;
}

export function getBytesPerCommitment(): number {
  return loadNativeModule().BYTES_PER_COMMITMENT;
}

let kzgInstance: DasContextJs | undefined;

/**
 * Returns the lazily-initialized KZG context.
 * The first call takes ~3 seconds to initialize the precomputation tables.
 */
export function getKzg(): DasContextJs {
  if (!kzgInstance) {
    kzgInstance = loadNativeModule().DasContextJs.create({ usePrecomp: true });
  }
  return kzgInstance;
}
