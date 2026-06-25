import type { HandlersForPrefix, ORACLE_REGISTRY } from './oracle_registry.js';

/**
 * Miscellaneous oracle methods, not very Aztec-specific and expected to be available in all scenarios in which aztec-nr
 * code runs, except #[external("public")] functions (since those are transpiled to AVM bytecode, where there are no
 * oracles).
 */
export type IMiscOracle = HandlersForPrefix<typeof ORACLE_REGISTRY, 'misc'> & { isMisc: true };

/**
 * Oracle methods associated with the execution of an Aztec #[external("utility")] function. Note that the IMiscOracle
 * methods are also expected to be available in these contexts.
 */
export type IUtilityExecutionOracle = HandlersForPrefix<typeof ORACLE_REGISTRY, 'utl'> & { isUtility: true };

/**
 * Oracle methods associated with the execution of an Aztec #[external("private")] function. Note that both the
 * IMiscOracle and IUtilityExecutionOracle methods are also expected to be available in these contexts.
 */
export type IPrivateExecutionOracle = HandlersForPrefix<typeof ORACLE_REGISTRY, 'prv'> & { isPrivate: true };
