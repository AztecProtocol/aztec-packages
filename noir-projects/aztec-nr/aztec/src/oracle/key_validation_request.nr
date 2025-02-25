use dep::protocol_types::abis::validation_requests::{
    key_validation_request::KEY_VALIDATION_REQUEST_LENGTH, KeyValidationRequest,
};

#[oracle(getKeyValidationRequest)]
unconstrained fn get_key_validation_request_oracle(
    _pk_m_hash: Field,
    // TODO: the key_index is not used by the typescript oracle receiver.
    // Perhaps all that's needed to identify the type of key is the hash of
    // the key. Consider removing this key_index field from all fns in this
    // file.
    _key_index: Field,
) -> [Field; KEY_VALIDATION_REQUEST_LENGTH] {}

unconstrained fn get_key_validation_request_internal(
    npk_m_hash: Field,
    key_index: Field,
) -> KeyValidationRequest {
    let result = get_key_validation_request_oracle(npk_m_hash, key_index);
    KeyValidationRequest::deserialize(result)
}

/**
 * pk_m_hash - a poseidon2 hash of one of the user's master public keys.
 * key_index - denotes the type of key. If we had enums in Noir we'd use 
 * those instead. See aztec_nr/keys/constants.nr.
 */
pub unconstrained fn get_key_validation_request(
    pk_m_hash: Field,
    key_index: Field,
) -> KeyValidationRequest {
    // TODO: the `_internal` function seems redundant.
    get_key_validation_request_internal(pk_m_hash, key_index)
}

// TODO: this oracle is untested. How do we set up a test environment which
// establishes keypairs that are stored in the user's pxe keystore?
