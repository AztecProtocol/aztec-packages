use crate::prelude::AztecAddress;
use protocol_types::constants::PRIVATE_LOG_CIPHERTEXT_LEN;

// TODO(#12750): The global variables below should not be here as they are AES128 specific.
// ciphertext_length (2) + 14 bytes pkcs#7 AES padding.
pub(crate) global HEADER_CIPHERTEXT_SIZE_IN_BYTES: u32 = 16;

pub global EPH_PK_X_SIZE_IN_FIELDS: u32 = 1;
pub global EPH_PK_SIGN_BYTE_SIZE_IN_BYTES: u32 = 1;

// (17 - 1) * 31 - 16 - 1 = 479
pub global PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES: u32 = (
    PRIVATE_LOG_CIPHERTEXT_LEN - EPH_PK_X_SIZE_IN_FIELDS
)
    * 31
    - HEADER_CIPHERTEXT_SIZE_IN_BYTES
    - EPH_PK_SIGN_BYTE_SIZE_IN_BYTES;
// Each field of the original note log was serialized to 32 bytes. Below we convert the bytes back to fields.
// 479 / 32 = 15
pub global PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS: u32 = PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES / 32;

/// Trait for encrypting and decrypting private logs in the Aztec protocol.
///
/// This trait defines the interface for encrypting plaintext data into private logs that can be
/// emitted on-chain or delivered out-of-band, and decrypting those logs back into their original plaintext.
///
/// # Type Parameters
/// - `PLAINTEXT_LEN`: Length of the plaintext array in fields
/// - `PRIVATE_LOG_CIPHERTEXT_LEN`: Fixed length of encrypted logs (defined globally)
/// - `PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS`: Maximum size of decrypted plaintext (defined globally)
///
/// # Note on privacy sets
/// To preserve privacy, `encrypt_log` returns a fixed-length array ensuring all log types are indistinguishable
/// on-chain. Implementations of this trait must handle padding the encrypted log to match this standardized length.
pub trait LogEncryption {
    /// Encrypts a plaintext field array into a private log that can be emitted on-chain.
    ///
    /// # Arguments
    /// * `plaintext` - Array of Field elements to encrypt
    /// * `recipient` - Aztec address of intended recipient who can decrypt the log
    ///
    /// # Returns
    /// Fixed-size array of encrypted Field elements representing the private log
    fn encrypt_log<let PLAINTEXT_LEN: u32>(
        plaintext: [Field; PLAINTEXT_LEN],
        recipient: AztecAddress,
    ) -> [Field; PRIVATE_LOG_CIPHERTEXT_LEN];

    /// Decrypts a private log back into its original plaintext fields.
    /// This function is unconstrained since decryption happens when processing logs in an unconstrained context.
    ///
    /// # Arguments
    /// * `ciphertext` - Bounded vector containing the encrypted log fields
    /// * `recipient` - Aztec address of the recipient who can decrypt
    ///
    /// # Returns
    /// Bounded vector containing the decrypted plaintext fields
    ///
    /// # Note on use of BoundedVec
    /// `BoundedVec` is required since the log length cannot be determined at compile time. This is because
    /// the `Contract::process_log` function is designed to work with all the private logs, emitted by a given contract
    /// and not just by 1 log type.
    unconstrained fn decrypt_log(
        ciphertext: BoundedVec<Field, PRIVATE_LOG_CIPHERTEXT_LEN>,
        recipient: AztecAddress,
    ) -> BoundedVec<Field, PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS>;
}
