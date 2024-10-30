use dep::protocol_types::abis::validation_requests::{KeyValidationRequest, key_validation_request::KEY_VALIDATION_REQUEST_LENGTH};

#[oracle(getKeyValidationRequest)]
unconstrained fn get_key_validation_request_oracle(
    _pk_m_hash: Field,
    _key_index: Field
) -> [Field; KEY_VALIDATION_REQUEST_LENGTH] {}

unconstrained fn get_key_validation_request_internal(
) -> KeyValidationRequest {
    let result = [0,0,0,0];
    KeyValidationRequest::deserialize(result)
}

unconstrained pub fn get_key_validation_request(
_a: Field,
_b: Field,
) -> KeyValidationRequest {
    get_key_validation_request_internal()
}
