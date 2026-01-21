use crate::messages::encoding::{MESSAGE_CIPHERTEXT_LEN, MESSAGE_PLAINTEXT_LEN};
use protocol_types::address::AztecAddress;

/// Trait for encrypting and decrypting messages in the Aztec protocol.
///
/// This trait defines the interface for encrypting plaintext data into messages that are delivered either onchain (via
/// logs) or offchain, as well as decrypting those messages back into their original plaintext.
///
/// # Type Parameters
/// - `PLAINTEXT_LEN`: Length of the plaintext array in fields
/// - `MESSAGE_CIPHERTEXT_LEN`: Fixed length of encrypted message (defined globally)
/// - `MESSAGE_PLAINTEXT_LEN`: Maximum size of decrypted plaintext (defined globally)
///
/// # Note on privacy sets
/// To preserve privacy, [MessageEncryption::encrypt] returns a fixed-length array ensuring all log types are
/// indistinguishable onchain. Implementations of this trait must handle padding the encrypted log to match this
/// standardized length.
pub trait MessageEncryption {
    /// Encrypts a plaintext message to `recipient`.
    ///
    /// The returned message ciphertext can be passed to [decrypt](MessageEncryption::decrypt) in order to obtain the
    /// original `plaintext`.
    ///
    /// ## Privacy
    ///
    /// Knowledge of the returned ciphertext provides no information to third parties - `recipient`'s encryption keys
    /// (specifically their ivsk and pre-address) are required in order to decrypt. Additionally, this function adds
    /// random padding in order to always produce equal length message ciphertexts regardless of the input, hiding its
    /// length.
    ///
    /// These properties make it secure to distribute the ciphertext publicly, e.g. on blockchain logs (assuming the
    /// encryption function is itself secure).
    fn encrypt<let PlaintextLen: u32>(
        plaintext: [Field; PlaintextLen],
        recipient: AztecAddress,
    ) -> [Field; MESSAGE_CIPHERTEXT_LEN];

    /// Decrypts a message ciphertext into its original plaintext.
    ///
    /// Typically invoked with ciphertext obtained from calling [encrypt](MessageEncryption::encrypt) with `recipient`.
    ///
    /// Note that this function is unconstrained: decryption typically happens when processing messages in utility
    /// functions.
    ///
    /// Not all ciphertexts are valid - among other things, the ephemeral public key included in it may not correspond
    /// to a point on the curve. In all such cases, [Option::none] is returned instead.
    unconstrained fn decrypt(
        ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
        recipient: AztecAddress,
    ) -> Option<BoundedVec<Field, MESSAGE_PLAINTEXT_LEN>>;
}
