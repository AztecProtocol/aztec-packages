use dep::protocol_types::{address::AztecAddress, grumpkin_point::GrumpkinPoint, grumpkin_private_key::GrumpkinPrivateKey};

// Nullifier keys pertaining to a specific account
struct NullifierKeys {
    // TODO: (ek) Replace this with master_nullifier_public_key_hash
    account: AztecAddress,
    master_nullifier_public_key: GrumpkinPoint,
    app_nullifier_secret_key: Field,
}

#[oracle(getNullifierKeys)]
fn get_nullifier_keys_oracle(_account: AztecAddress) -> [Field; 3] {}

unconstrained fn get_nullifier_keys_internal(account: AztecAddress) -> NullifierKeys {
    let result = get_nullifier_keys_oracle(account);
    NullifierKeys {
        account,
        master_nullifier_public_key: GrumpkinPoint { x: result[0], y: result[1] },
        app_nullifier_secret_key: result[2],
    }
}

pub fn get_nullifier_keys(account: AztecAddress) -> NullifierKeys {
    get_nullifier_keys_internal(account)
}

pub fn get_app_nullifier_secret_key(account: AztecAddress) -> Field {
    get_nullifier_keys_internal(account).app_nullifier_secret_key
}

// TODO(ek): Replace get_nullifier_keys above with this once we no longer get nullifier keys with address
#[oracle(getNullifierKeysWithMasterNullifierPublicKeyHash)]
fn get_nullifier_keys_with_master_nullifier_public_key_hash_oracle(_master_nullifier_public_key_hash: Field) -> [Field; 3] {}

unconstrained fn get_nullifier_keys_with_master_nullifier_public_key_hash_internal(master_nullifier_public_key_hash: Field) -> NullifierKeys {
    let result = get_nullifier_keys_with_master_nullifier_public_key_hash_oracle(master_nullifier_public_key_hash);
    NullifierKeys {
        account: AztecAddress::zero(),
        master_nullifier_public_key: GrumpkinPoint { x: result[0], y: result[1] },
        app_nullifier_secret_key: result[2],
    }
}

pub fn get_nullifier_keys_with_master_nullifier_public_key_hash(master_nullifier_public_key_hash: Field) -> NullifierKeys {
    get_nullifier_keys_with_master_nullifier_public_key_hash_internal(master_nullifier_public_key_hash)
}

pub fn get_app_nullifier_secret_key_with_master_nullifier_public_key_hash(master_nullifier_public_key_hash: Field) -> Field {
    get_nullifier_keys_with_master_nullifier_public_key_hash_internal(master_nullifier_public_key_hash).app_nullifier_secret_key
}
