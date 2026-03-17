/// The ORACLE_VERSION constant is used to check that the oracle interface is in sync between PXE and Aztec.nr. We need
/// to version the oracle interface to ensure that developers get a reasonable error message if they use incompatible
/// versions of Aztec.nr and PXE. The Noir counterpart is in `noir-projects/aztec-nr/aztec/src/oracle/version.nr`.
///
/// @dev Whenever a contract function or Noir test is run, the `aztec_utl_assertCompatibleOracleVersion` oracle is called
/// and if the oracle version is incompatible an error is thrown.
<<<<<<< HEAD
export const ORACLE_VERSION = 18;
=======
export const ORACLE_VERSION = 17;
>>>>>>> 3d501c2c36 (feat!(aztec-nr,pxe,txe): make AES128 decrypt oracle return Option)

/// This hash is computed as by hashing the Oracle interface and it is used to detect when the Oracle interface changes,
/// which in turn implies that you need to update the ORACLE_VERSION constant in this file and in
/// `noir-projects/aztec-nr/aztec/src/oracle/version.nr`.
<<<<<<< HEAD
export const ORACLE_INTERFACE_HASH = 'ab9ba6bb6675a4663d66af494bec195ab1d18fa2b646549323e0f54cac6af1de';
=======
export const ORACLE_INTERFACE_HASH = 'f9e965a21bd027693cb6b66dbdf87a3b7411d5ec1c8e0124b3a8852eaac574df';
>>>>>>> 3d501c2c36 (feat!(aztec-nr,pxe,txe): make AES128 decrypt oracle return Option)
