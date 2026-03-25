use crate::protocol::address::aztec_address::AztecAddress;
use crate::protocol::point::Point;

#[oracle(aztec_utl_getSharedSecret)]
unconstrained fn get_shared_secret_oracle(
    address: AztecAddress,
    ephPk: Point,
    contract_address: AztecAddress,
) -> Field {}

/// Returns an app-siloed shared secret between `address` and someone who knows the secret key behind an ephemeral
/// public key `ephPk`.
///
/// The returned value is a Field `s_app`, computed as:
///
/// ```text
/// S     = address_secret * ephPk          (raw ECDH point)
/// s_app = h(DOM_SEP, S.x, S.y, contract)  (app-siloed scalar)
/// ```
///
/// where `contract` is the address of the calling contract. The oracle host validates this matches its execution
/// context.
///
/// Without app-siloing, a malicious contract could call this oracle with public information (address, ephPk) and
/// obtain the same raw secret as the legitimate contract, enabling cross-contract decryption. By including the
/// contract address in the hash, each contract receives a different `s_app`, preventing this attack.
///
/// Callers derive indexed subkeys from `s_app` via
/// [`derive_shared_secret_subkey`](crate::keys::ecdh_shared_secret::derive_shared_secret_subkey).
pub unconstrained fn get_shared_secret(address: AztecAddress, ephPk: Point, contract_address: AztecAddress) -> Field {
    get_shared_secret_oracle(address, ephPk, contract_address)
}
