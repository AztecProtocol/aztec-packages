import { BackendType, Barretenberg } from '@aztec/bb.js';

import { loadTrustedSetup } from './trusted_setup_loader.js';

/**
 * Ensures KZG trusted setup is loaded into barretenberg.
 * This is called lazily on first use to avoid initializing at module load time.
 */
export async function ensureKzgInitialized(): Promise<void> {
  const api = await Barretenberg.initSingleton({ threads: 1, backend: BackendType.NativeUnixSocket });
  const { g1Lagrange, g1Monomial, g2Monomial } = loadTrustedSetup();
  await api.kzgLoadTrustedSetup({ g1Lagrange, g1Monomial, g2Monomial });
}
