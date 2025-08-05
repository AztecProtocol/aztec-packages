use protocol_types::{address::aztec_address::AztecAddress, point::Point};

// TODO(#12656): return an app-siloed secret + document this
#[oracle(utilityGetSharedSecret)]
unconstrained fn get_shared_secret_oracle(address: AztecAddress, ephPk: Point) -> Point {}

/// Returns an app-siloed shared secret between `address` and someone who knows the secret key behind an
/// ephemeral public key `ephPk`. The app-siloing means that contracts cannot retrieve secrets that belong to
/// other contracts, and therefore cannot e.g. decrypt their messages. This is an important security consideration
/// given that both the `address` and `ephPk` are public information.
///
/// The shared secret `S` is computed as:
/// `let S =  (ivsk + h) * ephPk`
/// where `ivsk + h` is the 'preaddress' i.e. the preimage of the address, also called the address secret.
/// TODO(#12656): app-silo this secret
pub unconstrained fn get_shared_secret(address: AztecAddress, ephPk: Point) -> Point {
    get_shared_secret_oracle(address, ephPk)
}
