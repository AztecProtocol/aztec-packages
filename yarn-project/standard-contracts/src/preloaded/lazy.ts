import { getStandardAuthRegistry } from '../auth-registry/lazy.js';
import { getHistoricalStandardHandshakeRegistries, getStandardHandshakeRegistry } from '../handshake-registry/lazy.js';
import { getStandardMultiCallEntrypoint } from '../multi-call-entrypoint/lazy.js';
import type { StandardContract } from '../standard_contract.js';

/**
 * Returns the standard contracts every PXE registers by default: the MultiCallEntrypoint, the AuthRegistry, and the
 * HandshakeRegistry, plus superseded HandshakeRegistry deployments that remain live onchain so contracts compiled
 * against older releases keep resolving the registry version they were built for.
 */
export async function getDefaultStandardPreloadedContracts(): Promise<StandardContract[]> {
  const [multiCallEntrypoint, authRegistry, handshakeRegistry, historicalHandshakeRegistries] = await Promise.all([
    getStandardMultiCallEntrypoint(),
    getStandardAuthRegistry(),
    getStandardHandshakeRegistry(),
    getHistoricalStandardHandshakeRegistries(),
  ]);
  return [multiCallEntrypoint, authRegistry, handshakeRegistry, ...historicalHandshakeRegistries];
}
