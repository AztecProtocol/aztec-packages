use dep::protocol_types::{address::AztecAddress, grumpkin_point::GrumpkinPoint, grumpkin_private_key::GrumpkinPrivateKey};

// Nullifier keys pertaining to a specific npk_m_hash
struct NullifierKeys {
    master_nullifier_public_key: GrumpkinPoint,
    app_nullifier_secret_key: Field,
}

#[oracle(getNullifierKeys)]
fn get_nullifier_keys_oracle(_npk_m_hash: Field) -> [Field; 3] {}

unconstrained fn get_nullifier_keys_internal(npk_m_hash: Field) -> NullifierKeys {
    let result = get_nullifier_keys_oracle(npk_m_hash);
    NullifierKeys {
        master_nullifier_public_key: GrumpkinPoint { x: result[0], y: result[1] },
        app_nullifier_secret_key: result[2]
    }
}

// We get the full struct Nullifier Keys here
pub fn get_nullifier_keys(npk_m_hash: Field) -> NullifierKeys {
    get_nullifier_keys_internal(npk_m_hash)
}

// We are only getting the app_nullifier_secret_key here
pub fn get_nsk_app(npk_m_hash: Field) -> Field {
    get_nullifier_keys_internal(npk_m_hash).app_nullifier_secret_key
}
