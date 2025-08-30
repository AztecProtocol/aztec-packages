/// The ORACLE_VERSION constant is used to check that the oracle interface is in sync between PXE and Aztec.nr. We need
/// to version the oracle interface to ensure that a developer gets a nice error message if he uses incompatible
/// versions of Aztec.nr and PXE. The Noir counterpart is in `oracle_version.nr`.
///
/// @dev Whenever a contract function or TXE test is run, the `utilityAssertOracleVersionMatches` is called and if
/// there is a mismatch, an error is thrown.
export const ORACLE_VERSION = 1;

/// This hash is computed as by hashing the Oracle interface and it is used to detect when the Oracle interface changes,
/// which in turn implies that you need to update the ORACLE_VERSION constant.
export const ORACLE_INTERFACE_HASH = 'b48d38f93eaa084033fc5970bf96e559c33c4cdc07d889ab00b4d63f9590739d';
