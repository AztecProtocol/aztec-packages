use crate::protocol::{address::{AztecAddress, PartialAddress}, point::Point, public_keys::{IvpkM, PublicKeys}};

// TODO(F-498): review naming consistency
pub unconstrained fn get_public_keys_and_partial_address(address: AztecAddress) -> (PublicKeys, PartialAddress) {
    try_get_public_keys_and_partial_address(address).expect(f"Public keys not registered for account {address}")
}

/// Oracle wire format: `[npk_m_hash, ivpk_m.x, ivpk_m.y, ovpk_m_hash, tpk_m_hash, partial_address]`.
///
/// Three of the four master public keys are exposed only as hashes; `ivpk_m` is sent
/// as its affine coordinates because address derivation and encrypt-to-address require the point
/// in-circuit. This point is assumed to be non-infinite.
#[oracle(aztec_utl_getPublicKeysAndPartialAddress)]
unconstrained fn get_public_keys_and_partial_address_oracle(_address: AztecAddress) -> Option<[Field; 6]> {}

// TODO(F-498): review naming consistency
pub unconstrained fn try_get_public_keys_and_partial_address(
    address: AztecAddress,
) -> Option<(PublicKeys, PartialAddress)> {
    get_public_keys_and_partial_address_oracle(address).map(|result: [Field; 6]| {
        let keys = PublicKeys {
            npk_m_hash: result[0],
            ivpk_m: IvpkM { inner: Point { x: result[1], y: result[2], is_infinite: false } },
            ovpk_m_hash: result[3],
            tpk_m_hash: result[4],
        };

        let partial_address = PartialAddress::from_field(result[5]);

        (keys, partial_address)
    })
}
