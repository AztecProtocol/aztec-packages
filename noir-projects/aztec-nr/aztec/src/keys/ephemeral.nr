use std::embedded_curve_ops::{EmbeddedCurveScalar, fixed_base_scalar_mul};

use dep::protocol_types::{point::Point, scalar::Scalar};

use crate::oracle::random::random;

pub fn generate_ephemeral_key_pair() -> (Scalar, Point) {
    // @todo Need to draw randomness from the full domain of Fq not only Fr

    // Safety: we use the randomness to preserve the privacy of both the sender and recipient via encryption, so a
    // malicious sender could use non-random values to reveal the plaintext. But they already know it themselves anyway,
    // and so the recipient already trusts them to not disclose this information. We can therefore assume that the
    // sender will cooperate in the random value generation.
    let randomness = unsafe { random() };

    // TODO(#12757): compute the key pair without constraining eph_sk twice (once in from_field, once in the black box
    // called by fixed_base_scalar_mul).
    let eph_sk = EmbeddedCurveScalar::from_field(randomness);
    let eph_pk = fixed_base_scalar_mul(eph_sk);

    (eph_sk, eph_pk)
}
