use super::{BlackboxSolver, RuntimeError};
use noir_rs_barretenberg::schnorr;

/// Trait defining the operations associated with the Schnorr signature scheme.
pub(crate) trait SchnorrSig {
    /// Constructs a signature for a given message using the provided private key.
    ///
    /// # Parameters
    ///
    /// * `message`: The byte slice representing the message to be signed.
    /// * `private_key`: The private key used for signing the message.
    ///
    /// # Returns
    ///
    /// Returns a tuple of two arrays of bytes, representing the `s` and `e` components of the signature.
    /// On failure, it returns a `RuntimeError`.
    fn construct_signature(
        &self,
        message: &[u8],
        private_key: [u8; 32],
    ) -> Result<([u8; 32], [u8; 32]), RuntimeError>;

    /// Constructs a public key from a given private key.
    ///
    /// # Parameters
    ///
    /// * `private_key`: The private key used to derive the public key.
    ///
    /// # Returns
    ///
    /// Returns an array of bytes representing the public key.
    /// On failure, it returns a `RuntimeError`.
    fn construct_public_key(&self, private_key: [u8; 32]) -> Result<[u8; 64], RuntimeError>;

    /// Verifies a Schnorr signature for a given message using the provided public key.
    ///
    /// # Parameters
    ///
    /// * `pub_key`: The public key against which the signature is verified.
    /// * `sig_s`: The `s` component of the signature.
    /// * `sig_e`: The `e` component of the signature.
    /// * `message`: The byte slice representing the message to be verified.
    ///
    /// # Returns
    ///
    /// Returns a boolean indicating if the signature is valid.
    /// On failure, it returns a `RuntimeError`.
    fn verify_signature(
        &self,
        pub_key: [u8; 64],
        sig_s: [u8; 32],
        sig_e: [u8; 32],
        message: &[u8],
    ) -> Result<bool, RuntimeError>;
}

impl SchnorrSig for BlackboxSolver {
    fn construct_signature(
        &self,
        message: &[u8],
        private_key: [u8; 32],
    ) -> Result<([u8; 32], [u8; 32]), RuntimeError> {
        let (sig_s, sig_e) = unsafe { schnorr::construct_signature(message, &private_key) }?;
        Ok((sig_s, sig_e))
    }

    #[allow(dead_code)]
    fn construct_public_key(&self, private_key: [u8; 32]) -> Result<[u8; 64], RuntimeError> {
        let pubkey = schnorr::compute_public_key(&private_key)?;
        Ok(pubkey)
    }

    fn verify_signature(
        &self,
        pub_key: [u8; 64],
        sig_s: [u8; 32],
        sig_e: [u8; 32],
        message: &[u8],
    ) -> Result<bool, RuntimeError> {
        let verified = unsafe { schnorr::verify_signature(message, pub_key, sig_s, sig_e) }?;

        // Note: If the signature verification fails for Barretenberg plonk,
        // then the entire circuit evaluation fails.
        Ok(verified)
    }
}
