use std::schnorr::verify_signature;
use dep::aztec::prelude::AztecAddress;
use crate::auth_oracle::AuthWitness;

pub fn recover_address(message_hash: Field, witness: AuthWitness) -> AztecAddress {
    let message_bytes: [u8; 32] = message_hash.to_be_bytes();
    // In a single key account contract we re-used ivpk_m as signing key
    let pub_key = std::embedded_curve_ops::EmbeddedCurvePoint { x: witness.keys.ivpk_m.inner.x, y: witness.keys.ivpk_m.inner.y, is_infinite: false };
    let verification = verify_signature(pub_key, witness.signature, message_bytes);
    assert(verification == true);

    AztecAddress::compute(witness.keys.hash(), witness.partial_address)
}
