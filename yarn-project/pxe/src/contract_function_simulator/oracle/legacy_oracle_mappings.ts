import type { ACIRCallback } from '@aztec/simulator/client';

import type { Oracle } from './oracle.js';

/**
 * Builds legacy oracle name callbacks for pinned protocol contracts whose artifacts are committed and cannot be
 * changed.
 *
 * On v4-next, the oracle methods still use the utilityXxx/privateXxx naming convention which matches the pinned
 * contract artifacts, so no legacy remappings are needed yet. This infrastructure is in place for when the oracle
 * methods are renamed to aztec_utl_/aztec_prv_ prefix convention (as has already happened on next).
 *
 * TODO(F-416): Remove these aliases on v5 when protocol contracts are redeployed.
 */
export function buildLegacyOracleCallbacks(_oracle: Oracle): ACIRCallback {
  return {};
}
