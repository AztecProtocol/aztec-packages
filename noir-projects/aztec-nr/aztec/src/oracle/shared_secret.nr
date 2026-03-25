use crate::protocol::address::aztec_address::AztecAddress;
use crate::protocol::point::Point;

#[oracle(aztec_utl_getSharedSecret)]
unconstrained fn get_shared_secret_oracle(address: AztecAddress, ephPk: Point) -> Field {}

/// Returns an app-siloed shared secret between `address` and someone who knows the secret key behind an
/// ephemeral public key `ephPk`.
///
/// The returned value is a Field `s_app`, computed as:
///
/// ```text
/// S     = address_secret * ephPk          (raw ECDH point)
/// s_app = h(DOM_SEP, S.x, S.y, contract)  (app-siloed scalar)
/// ```
///
/// where `contract` is the address of the contract calling this oracle.
///
/// ## Why app-silo?
///
/// Without app-siloing, a malicious contract developer could collect all public ephemeral keys (Epks) and
/// write a contract that calls this oracle for each one. If they trick a user into running their contract,
/// it gains access to the user's oracle and can compute candidate shared secrets for all Epks using the
/// user's address secret key. Some of those will be correct (when the Epk was intended for that user),
/// allowing the attacker to decrypt the associated ciphertexts. By including the contract address in the
/// hash, each contract receives a different `s_app`, preventing cross-contract decryption.
///
/// Callers derive indexed randomness from `s_app` via
/// [`derive_shared_secret_randomness`](crate::keys::ecdh_shared_secret::derive_shared_secret_randomness).
pub unconstrained fn get_shared_secret(address: AztecAddress, ephPk: Point) -> Field {
    get_shared_secret_oracle(address, ephPk)
}
