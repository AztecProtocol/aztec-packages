use protocol_types::abis::validation_requests::KeyValidationRequest;

#[oracle(utilityGetKeyValidationRequest)]
unconstrained fn get_key_validation_request_oracle(
    _pk_m_hash: Field,
    _key_index: Field,
) -> KeyValidationRequest {}

pub unconstrained fn get_key_validation_request(
    pk_m_hash: Field,
    key_index: Field,
) -> KeyValidationRequest {
    get_key_validation_request_oracle(pk_m_hash, key_index)
}
