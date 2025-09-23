use crate::messages::encoding::{MESSAGE_CIPHERTEXT_LEN, MESSAGE_PLAINTEXT_LEN};
use protocol_types::address::AztecAddress;

/// Trait for encrypting and decrypting private logs in the Aztec protocol.
///
/// This trait defines the interface for encrypting plaintext data into private logs that can be
/// emitted onchain or delivered offchain, and decrypting those logs back into their original plaintext.
///
/// # Type Parameters
/// - `PLAINTEXT_LEN`: Length of the plaintext array in fields
/// - `MESSAGE_CIPHERTEXT_LEN`: Fixed length of encrypted message (defined globally)
/// - `MESSAGE_PLAINTEXT_LEN`: Maximum size of decrypted plaintext (defined globally)
///
/// # Note on privacy sets
/// To preserve privacy, `encrypt` returns a fixed-length array ensuring all log types are indistinguishable
/// onchain. Implementations of this trait must handle padding the encrypted log to match this standardized length.
pub trait MessageEncryption {
    /// Encrypts a plaintext field array into a private log that can be emitted onchain.
    ///
    /// # Arguments
    /// * `plaintext` - Array of Field elements to encrypt
    /// * `recipient` - Aztec address of intended recipient who can decrypt the log
    ///
    /// # Returns
    /// Fixed-size array of encrypted Field elements representing the private log
    fn encrypt<let PlaintextLen: u32>(
        plaintext: [Field; PlaintextLen],
        recipient: AztecAddress,
    ) -> [Field; MESSAGE_CIPHERTEXT_LEN];

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
    unconstrained fn decrypt(
        ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
        recipient: AztecAddress,
    ) -> BoundedVec<Field, MESSAGE_PLAINTEXT_LEN>;
}
