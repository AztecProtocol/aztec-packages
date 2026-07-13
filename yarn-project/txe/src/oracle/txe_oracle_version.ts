/**
 * The TXE oracle version constants are used to check that the oracle interface used for tests is in sync between
 * TXE and Aztec.nr. This is separate from the contract oracle version in `pxe/src/oracle_version.ts`, which covers
 * oracles used during contract execution by PXE.
 *
 * The Noir counterparts are in `noir-projects/aztec-nr/aztec/src/test/helpers/txe_oracles.nr`.
 */
<<<<<<< HEAD
export const TXE_ORACLE_VERSION_MAJOR = 2;
export const TXE_ORACLE_VERSION_MINOR = 3;
=======
export const TXE_ORACLE_VERSION_MAJOR = 3;
export const TXE_ORACLE_VERSION_MINOR = 1;
>>>>>>> 97b4c75c95 (feat(txe): add option to authorize all utility call targets (#24662))

/**
 * This hash is computed from the TXE oracle interfaces (IAvmExecutionOracle and ITxeExecutionOracle) and is used to
 * detect when those interfaces change. When it does, bump:
 *   - TXE_ORACLE_VERSION_MAJOR (and reset MINOR to 0) for breaking changes, or
 *   - TXE_ORACLE_VERSION_MINOR for additive changes (new oracle method added).
 */
<<<<<<< HEAD
export const TXE_ORACLE_INTERFACE_HASH = '4ed3618087fafb4aa63c6580996a69bf6bc257844035a2019692586b5b8daf34';
=======
export const TXE_ORACLE_INTERFACE_HASH = '89c60f191f8f60ef72d592e46dd6c4afff10dc47a9e14f4f8d37e31e40857d9c';
>>>>>>> 97b4c75c95 (feat(txe): add option to authorize all utility call targets (#24662))
