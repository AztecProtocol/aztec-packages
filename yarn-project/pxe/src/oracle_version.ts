/// The ORACLE_VERSION constant is used to check that the oracle interface is in sync between PXE and Aztec.nr. We need
/// to version the oracle interface to ensure that developers get a reasonable error message if they use incompatible
/// versions of Aztec.nr and PXE. The Noir counterpart is in `noir-projects/aztec-nr/aztec/src/oracle/version.nr`.
///
/// @dev Whenever a contract function or Noir test is run, the `aztec_utl_assertCompatibleOracleVersion` oracle is called
/// and if the oracle version is incompatible an error is thrown.
export const ORACLE_VERSION = 18;

/// This hash is computed as by hashing the Oracle interface and it is used to detect when the Oracle interface changes,
/// which in turn implies that you need to update the ORACLE_VERSION constant in this file and in
/// `noir-projects/aztec-nr/aztec/src/oracle/version.nr`.
<<<<<<< HEAD
export const ORACLE_INTERFACE_HASH = 'a794cd3a217228efafbace02297a5c5097ee2f6f7727dbc53bb2334bf1ebaa28';
=======
export const ORACLE_INTERFACE_HASH = '57e5b07c6d55fb167ef90f8d0f410f9bdb5b154a31159c624a061be40b02a2c2';
>>>>>>> 68e4332d85 (feat: sync cache invalidation oracle (#21459))
