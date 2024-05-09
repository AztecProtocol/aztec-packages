use dep::protocol_types::{address::AztecAddress, grumpkin_point::GrumpkinPoint, grumpkin_private_key::GrumpkinPrivateKey};

// Nullifier keys pertaining to a specific npk_m_h
struct NullifierKeys {
    master_nullifier_public_key: GrumpkinPoint,
    app_nullifier_secret_key: Field,
}

#[oracle(getNullifierKeys)]
fn get_nullifier_keys_oracle(_master_nullifier_public_key_hash: Field) -> [Field; 3] {}

unconstrained fn get_nullifier_keys_internal(master_nullifier_public_key_hash: Field) -> NullifierKeys {
    let result = get_nullifier_keys_oracle(master_nullifier_public_key_hash);
    NullifierKeys {
        master_nullifier_public_key: GrumpkinPoint { x: result[0], y: result[1] },
        app_nullifier_secret_key: result[2]
    }
}

// We get the full struct Nullifier Keys here
pub fn get_nullifier_keys(master_nullifier_public_key_hash: Field) -> NullifierKeys {
    get_nullifier_keys_internal(master_nullifier_public_key_hash)
}

// We are only getting the app_nullifier_secret_key here
pub fn get_nsk_app_with_npk_m_h(master_nullifier_public_key_hash: Field) -> Field {
    get_nullifier_keys_internal(master_nullifier_public_key_hash).app_nullifier_secret_key
}
