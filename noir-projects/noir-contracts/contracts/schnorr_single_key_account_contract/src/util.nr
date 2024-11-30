use crate::auth_oracle::AuthWitness;
use dep::aztec::prelude::AztecAddress;

pub fn recover_address(message_hash: Field, witness: AuthWitness) -> AztecAddress {
    let message_bytes: [u8; 32] = message_hash.to_be_bytes();
    // In a single key account contract we re-used ivpk_m as signing key

    schnorr::assert_valid_signature(
        std::embedded_curve_ops::EmbeddedCurvePoint {
            x: witness.keys.ivpk_m.inner.x,
            y: witness.keys.ivpk_m.inner.y,
            is_infinite: false,
        },
        witness.signature,
        message_bytes,
    );

    AztecAddress::compute(witness.keys, witness.partial_address)
}
