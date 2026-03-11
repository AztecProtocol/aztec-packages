/// The ORACLE_VERSION constant is used to check that the oracle interface is in sync between PXE and Aztec.nr. We need
/// to version the oracle interface to ensure that developers get a reasonable error message if they use incompatible
/// versions of Aztec.nr and PXE. The Noir counterpart is in `noir-projects/aztec-nr/aztec/src/oracle/version.nr`.
///
/// @dev Whenever a contract function or Noir test is run, the `utilityAssertCompatibleOracleVersion` oracle is called
/// and if the oracle version is incompatible an error is thrown.
<<<<<<< HEAD
export const ORACLE_VERSION = 12;
=======
export const ORACLE_VERSION = 16;
>>>>>>> b1ada99eef (feat: offchain reception (#20893))

/// This hash is computed as by hashing the Oracle interface and it is used to detect when the Oracle interface changes,
/// which in turn implies that you need to update the ORACLE_VERSION constant in this file and in
/// `noir-projects/aztec-nr/aztec/src/oracle/version.nr`.
<<<<<<< HEAD
export const ORACLE_INTERFACE_HASH = '666a8a7fc697f72b29dbf0ae7464db269cf5afa019acac8861f814543147dbb4';
=======
export const ORACLE_INTERFACE_HASH = '73ccb2a24bc9fe7514108be9ff98d7ca8734bc316fb7c1ec4329d1d32f412a55';
>>>>>>> b1ada99eef (feat: offchain reception (#20893))
