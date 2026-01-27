/// The ORACLE_VERSION constant is used to check that the oracle interface is in sync between PXE and Aztec.nr. We need
/// to version the oracle interface to ensure that developers get a reasonable error message if they use incompatible
/// versions of Aztec.nr and PXE. The Noir counterpart is in `noir-projects/aztec-nr/aztec/src/oracle/version.nr`.
///
/// @dev Whenever a contract function or Noir test is run, the `utilityAssertCompatibleOracleVersion` oracle is called
/// and if the oracle version is incompatible an error is thrown.
export const ORACLE_VERSION = 9;

/// This hash is computed as by hashing the Oracle interface and it is used to detect when the Oracle interface changes,
/// which in turn implies that you need to update the ORACLE_VERSION constant in this file and in
/// `noir-projects/aztec-nr/aztec/src/oracle/version.nr`.
export const ORACLE_INTERFACE_HASH = '9866cc52510acaef75a3d47a0ed501fd9ff92b9d53b2c8a88c8a3ffd04ced81f';
