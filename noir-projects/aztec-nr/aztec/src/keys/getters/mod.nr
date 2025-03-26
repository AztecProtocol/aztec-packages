use crate::{
    keys::constants::{NULLIFIER_INDEX, OUTGOING_INDEX},
    oracle::{
        key_validation_request::get_key_validation_request,
        keys::get_public_keys_and_partial_address,
    },
};
use dep::protocol_types::{address::AztecAddress, public_keys::PublicKeys};

mod test;

pub unconstrained fn get_nsk_app(npk_m_hash: Field) -> Field {
    get_key_validation_request(npk_m_hash, NULLIFIER_INDEX).sk_app
}

// A helper function that gets app-siloed outgoing viewing key for a given `ovpk_m_hash`. This function is used
// in unconstrained contexts only - when computing unconstrained note logs. The safe alternative is `request_ovsk_app`
// function defined on `PrivateContext`.
pub unconstrained fn get_ovsk_app(ovpk_m_hash: Field) -> Field {
    get_key_validation_request(ovpk_m_hash, OUTGOING_INDEX).sk_app
}

// Returns all public keys for a given account, applying proper constraints to the context. We read all
// keys at once since the constraints for reading them all are actually fewer than if we read them one at a time - any
// read keys that are not required by the caller can simply be discarded.
pub fn get_public_keys(account: AztecAddress) -> PublicKeys {
    // Safety: Public keys are constrained by showing their inclusion in the address's preimage.
    let (public_keys, partial_address) = unsafe { get_public_keys_and_partial_address(account) };
    assert_eq(
        account,
        AztecAddress::compute(public_keys, partial_address),
        "Invalid public keys hint for address",
    );

    public_keys
}
