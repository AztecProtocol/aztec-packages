/// The ORACLE_VERSION constant is used to check that the oracle interface is in sync between PXE and Aztec.nr. We need
/// to version the oracle interface to ensure that developers get a reasonable error message if they use incompatible
/// versions of Aztec.nr and PXE. The Noir counterpart is in `noir-projects/aztec-nr/aztec/src/oracle/version.nr`.
///
/// @dev Whenever a contract function or Noir test is run, the `aztec_utl_assertCompatibleOracleVersion` oracle is called
/// and if the oracle version is incompatible an error is thrown.
export const ORACLE_VERSION = 20;

/// This hash is computed as by hashing the Oracle interface and it is used to detect when the Oracle interface changes,
/// which in turn implies that you need to update the ORACLE_VERSION constant in this file and in
/// `noir-projects/aztec-nr/aztec/src/oracle/version.nr`.
<<<<<<< HEAD
export const ORACLE_INTERFACE_HASH = 'ab6bb5669bf20d3908eba5f3edaeec3bf1d828b902f5c2734054e372be6e5f22';
=======
export const ORACLE_INTERFACE_HASH = '93b5352522338a33462efb253b67808c59a805c1c90ee0e394285b49f34d9691';
>>>>>>> b0090ffc53 (refactor!: more consistent oracle names (#22018))
