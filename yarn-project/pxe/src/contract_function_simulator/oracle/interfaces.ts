import type { HandlersForPrefix } from './oracle_registry.js';
import type { ORACLE_REGISTRY } from './oracle_registry.js';

/** Handler interface for utility-scoped oracles (aztec_utl_*). */
export type IUtilityExecutionOracle = HandlersForPrefix<typeof ORACLE_REGISTRY, 'utl'> & { isUtility: true };

/** Handler interface for private-scoped oracles (aztec_prv_*). */
export type IPrivateExecutionOracle = HandlersForPrefix<typeof ORACLE_REGISTRY, 'prv'> & { isPrivate: true };
