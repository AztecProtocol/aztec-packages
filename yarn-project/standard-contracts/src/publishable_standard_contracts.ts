import { getStandardAuthRegistry } from './auth-registry/index.js';
import { getStandardHandshakeRegistry } from './handshake-registry/index.js';
import { getStandardPublicChecks } from './public-checks/index.js';
import type { StandardContract } from './standard_contract.js';

/**
 * Returns the standard contracts that are published on-chain (class registration + instance
 * publication) before their public functions can be called: AuthRegistry, PublicChecks, and
 * HandshakeRegistry. These are exactly the contracts guarded by the `ensure*Published` e2e setup
 * helpers.
 *
 * MultiCallEntrypoint is deliberately excluded: it is a client-side entrypoint used to encode
 * batched private calls and is never published for public execution.
 *
 * This is the single source of truth for the set of standard contracts that test environments seed
 * at genesis (registration/deployment nullifiers) and preload into the archiver contract store, so
 * the two stay consistent — preloading a class whose nullifier is not seeded would recreate the
 * publish-collision bug that genesis seeding avoids.
 */
export function getPublishableStandardContracts(): Promise<StandardContract[]> {
  return Promise.all([getStandardAuthRegistry(), getStandardPublicChecks(), getStandardHandshakeRegistry()]);
}
