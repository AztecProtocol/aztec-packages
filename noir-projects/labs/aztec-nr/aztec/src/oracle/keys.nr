use crate::protocol::{address::{AztecAddress, PartialAddress}, public_keys::PublicKeys};

// TODO(F-498): review naming consistency
pub unconstrained fn get_public_keys_and_partial_address(address: AztecAddress) -> (PublicKeys, PartialAddress) {
    try_get_public_keys_and_partial_address(address).expect(f"Public keys not registered for account {address}")
}

/// Five of the six master public keys are exposed only as hashes; `ivpk_m` is sent as its affine coordinates because
/// address derivation and encrypt-to-address require the point in-circuit. This point is assumed to be non-infinite.
#[oracle(aztec_utl_getPublicKeysAndPartialAddress)]
unconstrained fn get_public_keys_and_partial_address_oracle(
    _address: AztecAddress,
) -> Option<(PublicKeys, PartialAddress)> {}

// TODO(F-498): review naming consistency
pub unconstrained fn try_get_public_keys_and_partial_address(
    address: AztecAddress,
) -> Option<(PublicKeys, PartialAddress)> {
    get_public_keys_and_partial_address_oracle(address)
}
