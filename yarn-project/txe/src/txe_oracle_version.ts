/**
 * The TXE oracle version constants are used to check that the oracle interface used for tests is in sync between
 * TXE and Aztec.nr. This is separate from the contract oracle version in `pxe/src/oracle_version.ts`, which covers
 * oracles used during contract execution by PXE.
 *
 * The Noir counterparts are in `noir-projects/aztec-nr/aztec/src/test/helpers/txe_oracles.nr`.
 */
export const TXE_ORACLE_VERSION_MAJOR = 1;
export const TXE_ORACLE_VERSION_MINOR = 0;
