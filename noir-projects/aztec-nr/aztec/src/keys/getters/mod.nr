use dep::protocol_types::address::AztecAddress;
use crate::{
    oracle::{keys::get_public_keys_and_partial_address, key_validation_request::get_key_validation_request},
    keys::{public_keys::PublicKeys, constants::NULLIFIER_INDEX}
};

mod test;

unconstrained pub fn get_nsk_app(npk_m_hash: Field) -> Field {
    get_key_validation_request(npk_m_hash, NULLIFIER_INDEX).sk_app
}

// Returns all current public keys for a given account, applying proper constraints to the context. We read all
// keys at once since the constraints for reading them all are actually fewer than if we read them one at a time - any
// read keys that are not required by the caller can simply be discarded.
pub fn get_public_keys(account: AztecAddress) -> PublicKeys {
    let (hinted_canonical_public_keys, partial_address) = unsafe {
        get_public_keys_and_partial_address(account)
    };
    assert_eq(
        account, AztecAddress::compute(hinted_canonical_public_keys.hash(), partial_address), "Invalid public keys hint for address"
    );

    hinted_canonical_public_keys
}
