use dep::protocol_types::{address::{AztecAddress, PartialAddress}, grumpkin_point::GrumpkinPoint};
use crate::oracle::keys::{get_public_keys_and_partial_address, get_public_keys_and_partial_address_with_npk_m_hash};

// To be nuked in my next PR: https://github.com/AztecProtocol/aztec-packages/pull/6219
pub fn get_public_key(address: AztecAddress) -> GrumpkinPoint {
    let result = get_public_keys_and_partial_address(address);
    result.0[1]
}

// TODO(#5901 -> #5834): This should be refactored, would be most effective to do it after new encrypted log scheme, as well as key store pxe separation.
pub fn get_public_key_with_npk_m_hash(npk_m_hash: Field) -> GrumpkinPoint {
    let result = get_public_keys_and_partial_address_with_npk_m_hash(npk_m_hash);
    result.0[1]
}
