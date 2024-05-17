use dep::protocol_types::{
    grumpkin_point::GrumpkinPoint,
    abis::key_validation_request::{KeyValidationRequest, KEY_VALIDATION_REQUEST_LENGTH}
};

// TODO(benesjan): It's weird to be importing here form keys and it's probably a circular dependency - restructure it
use crate::keys::public_keys::NULLIFIER_INDEX;

#[oracle(getKeyValidationRequest)]
fn get_key_validation_request_oracle(_npk_m_hash: Field, _key_index: Field) -> [Field; KEY_VALIDATION_REQUEST_LENGTH] {}

unconstrained fn get_key_validation_request_internal(npk_m_hash: Field, key_index: Field) -> KeyValidationRequest {
    let result = get_key_validation_request_oracle(npk_m_hash, key_index);
    KeyValidationRequest::deserialize(result)
}

pub fn get_key_validation_request(pk_m_hash: Field, key_index: Field) -> KeyValidationRequest {
    get_key_validation_request_internal(pk_m_hash, key_index)
}

pub fn get_nullifier_key_validation_request(npk_m_hash: Field) -> KeyValidationRequest {
    get_key_validation_request_internal(npk_m_hash, NULLIFIER_INDEX)
}

pub fn get_nsk_app(npk_m_hash: Field) -> Field {
    get_nullifier_key_validation_request(npk_m_hash).app_nullifier_secret_key
}
