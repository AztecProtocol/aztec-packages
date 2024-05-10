use dep::protocol_types::{address::AztecAddress, grumpkin_point::GrumpkinPoint};
use crate::oracle::keys::get_public_keys_and_partial_address;

// To be nuked in my next PR: https://github.com/AztecProtocol/aztec-packages/pull/6219
pub fn get_public_key(address: AztecAddress) -> GrumpkinPoint {
    let result = get_public_keys_and_partial_address(address);
    result.0[1]
}

// TODO(#5901 -> #5834): This should be refactored, would be most effective to do it after new encrypted log scheme, as well as key store pxe separation.
#[oracle(getPublicKeyAndPartialAddressWithNpkMH)]
fn get_public_key_and_partial_address_with_npk_m_h_oracle(master_nullifier_public_key_hash: Field) -> [Field; 3] {}

unconstrained fn get_public_key_and_partial_address_with_npk_m_h_internal(master_nullifier_public_key_hash: Field) -> [Field; 3] {
    get_public_key_and_partial_address_with_npk_m_h_oracle(master_nullifier_public_key_hash)
}

// TODO (#5901): This is used when we emit encrypted logs and will be changed.
// TODO (#6178): This function should not be contraining things here.
pub fn get_public_key_with_npk_m_h(master_nullifier_public_key_hash: Field) -> GrumpkinPoint {
    let result = get_public_key_and_partial_address_with_npk_m_h_internal(master_nullifier_public_key_hash);
    let pub_key = GrumpkinPoint::new(result[0], result[1]);
    let partial_address = PartialAddress::from_field(result[2]);

    // TODO(#5830): disabling the following constraint until we update the oracle according to the new key scheme
    // let calculated_address = AztecAddress::compute(PublicKeysHash::compute(pub_key), partial_address);
    // assert(calculated_address.eq(address));

    pub_key
}
