/// The oracle version constants are used to check that the oracle interface is in sync between PXE and Aztec.nr.
/// We version the oracle interface as `major.minor` where:
///   - `major` = backward-breaking changes (must match exactly between PXE and Aztec.nr)
///   - `minor` = oracle additions (non-breaking; PXE minor >= contract minor)
///
/// The Noir counterparts are in `noir-projects/aztec-nr/aztec/src/oracle/version.nr`.
///
/// @dev Whenever a contract function or Noir test is run, the `aztec_utl_assertCompatibleOracleVersion` oracle is called.
/// If the major version is incompatible, an error is thrown immediately. The minor version is recorded by the PXE and
/// used to provide helpful error messages if a contract calls an oracle that doesn't exist. We don't throw immediately
/// if AZTEC_NR_MINOR > PXE_MINOR because if a contract is updated to use a newer Aztec.nr dependency without actually
/// using any of the new oracles then there is no reason to throw.
export const ORACLE_VERSION_MAJOR = 28;
export const ORACLE_VERSION_MINOR = 0;

/// This hash is computed from the Oracle interface and is used to detect when that interface changes. When it does,
/// you need to either:
/// - increment `ORACLE_VERSION_MAJOR` and reset `ORACLE_VERSION_MINOR` to zero if the change is breaking, or
/// - increment only `ORACLE_VERSION_MINOR` if the change is additive (a new oracle was added).
///
/// These constants must be kept in sync between this file and `noir-projects/aztec-nr/aztec/src/oracle/version.nr`.
export const ORACLE_INTERFACE_HASH = 'e79be5ea9898f986ce2c2a75b5f83fe92a35491b105760a244e0d5a68d1d8824';
