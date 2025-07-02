use crate::auth_oracle::AuthWitness;
use dep::aztec::protocol_types::address::AztecAddress;
use std::embedded_curve_ops::EmbeddedCurvePoint;

pub fn recover_address(message_hash: Field, witness: AuthWitness) -> AztecAddress {
    let message_bytes: [u8; 32] = message_hash.to_be_bytes();
    let public_key = EmbeddedCurvePoint {
        x: witness.keys.ivpk_m.inner.x,
        y: witness.keys.ivpk_m.inner.y,
        is_infinite: false,
    };

    // In a single key account contract we re-used ivpk_m as signing key
    schnorr::assert_valid_signature(public_key, witness.signature, message_bytes);

    AztecAddress::compute(witness.keys, witness.partial_address)
}
