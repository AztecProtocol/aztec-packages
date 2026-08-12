/**
 * The TXE oracle version constants are used to check that the oracle interface used for tests is in sync between
 * TXE and Aztec.nr. This is separate from the contract oracle version in `pxe/src/oracle_version.ts`, which covers
 * oracles used during contract execution by PXE.
 *
 * The Noir counterparts are in `noir-projects/labs/aztec-nr/aztec/src/test/helpers/txe_oracles.nr`.
 */
export const TXE_ORACLE_VERSION_MAJOR = 6;
export const TXE_ORACLE_VERSION_MINOR = 0;

/**
 * This hash is computed from the TXE-specific entries in `TXE_ORACLE_REGISTRY` and is used to
 * detect when those interfaces change. When it does, bump:
 *   - TXE_ORACLE_VERSION_MAJOR (and reset MINOR to 0) for breaking changes, or
 *   - TXE_ORACLE_VERSION_MINOR for additive changes (new oracle method added).
 */
export const TXE_ORACLE_INTERFACE_HASH = '188f8ca8d7c7d1ba8080b83d53beec544f7640030b3d6564d28e649941b02f19';
