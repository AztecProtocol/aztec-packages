use dep::protocol_types::abis::validation_requests::{
    key_validation_request::KEY_VALIDATION_REQUEST_LENGTH, KeyValidationRequest,
};

#[oracle(getKeyValidationRequest)]
unconstrained fn get_key_validation_request_oracle(
    _pk_m_hash: Field,
    _key_index: Field,
) -> [Field; KEY_VALIDATION_REQUEST_LENGTH] {}

unconstrained fn get_key_validation_request_internal(
    npk_m_hash: Field,
    key_index: Field,
) -> KeyValidationRequest {
    let result = get_key_validation_request_oracle(npk_m_hash, key_index);
    KeyValidationRequest::deserialize(result)
}

pub unconstrained fn get_key_validation_request(
    pk_m_hash: Field,
    key_index: Field,
) -> KeyValidationRequest {
    get_key_validation_request_internal(pk_m_hash, key_index)
}
