import { BarretenbergSync } from '@aztec/bb.js';

import { loadTrustedSetup } from './trusted_setup_loader.js';

let kzgInitialized = false;

/**
 * Ensures KZG trusted setup is loaded into barretenberg WASM.
 * This is called lazily on first use to avoid initializing at module load time.
 */
export async function ensureKzgInitialized(): Promise<void> {
  if (kzgInitialized) {
    return;
  }

  const api = await BarretenbergSync.initSingleton(process.env.BB_WASM_PATH);
  const { g1Lagrange, g1Monomial, g2Monomial } = loadTrustedSetup();

  api.bbApi.kzgLoadTrustedSetup({ g1Lagrange, g1Monomial, g2Monomial });
  kzgInitialized = true;
}
