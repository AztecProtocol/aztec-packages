use std::embedded_curve_ops::{EmbeddedCurveScalar, fixed_base_scalar_mul};

use crate::protocol::{point::Point, scalar::Scalar};

use crate::{oracle::random::random, utils::point::get_sign_of_point};

/// Generates a random ephemeral key pair.
pub fn generate_ephemeral_key_pair() -> (Scalar, Point) {
    // @todo Need to draw randomness from the full domain of Fq not only Fr

    // Safety: we use the randomness to preserve the privacy of both the sender and recipient via encryption, so a
    // malicious sender could use non-random values to reveal the plaintext. But they already know it themselves
    // anyway, and so the recipient already trusts them to not disclose this information. We can therefore assume that
    // the sender will cooperate in the random value generation.
    let randomness = unsafe { random() };

    // TODO(#12757): compute the key pair without constraining eph_sk twice (once in from_field, once in the black box
    // called by fixed_base_scalar_mul).
    let eph_sk = EmbeddedCurveScalar::from_field(randomness);
    let eph_pk = fixed_base_scalar_mul(eph_sk);

    (eph_sk, eph_pk)
}

/// Generates a random ephemeral key pair with a positive y-coordinate.
///
/// Unlike [`generate_ephemeral_key_pair`], the y-coordinate of the public key is guaranteed to be a positive value
/// (i.e. [`crate::utils::point::get_sign_of_point`] will return `true`).
///
/// This is useful as it means it is possible to just broadcast the x-coordinate as a single `Field` and then
/// reconstruct the original public key using [`crate::utils::point::point_from_x_coord_and_sign`] with `sign: true`.
pub fn generate_positive_ephemeral_key_pair() -> (Scalar, Point) {
    // Safety: we use the randomness to preserve the privacy of both the sender and recipient via encryption, so a
    // malicious sender could use non-random values to reveal the plaintext. But they already know it themselves
    // anyway, and so the recipient already trusts them to not disclose this information. We can therefore assume that
    // the sender will cooperate in the random value generation.
    let eph_sk = unsafe { generate_secret_key_for_positive_public_key() };
    let eph_pk = fixed_base_scalar_mul(eph_sk);

    assert(get_sign_of_point(eph_pk), "Got an ephemeral public key with a negative y coordinate");

    (eph_sk, eph_pk)
}

unconstrained fn generate_secret_key_for_positive_public_key() -> EmbeddedCurveScalar {
    let mut sk = std::mem::zeroed();

    loop {
        // We simply produce random secret keys until we find one that has results in a positive public key. About half
        // of all public keys fulfill this condition, so this should only take a few iterations at most.

        // @todo Need to draw randomness from the full domain of Fq not only Fr
        sk = EmbeddedCurveScalar::from_field(random());
        let pk = fixed_base_scalar_mul(sk);
        if get_sign_of_point(pk) {
            break;
        }
    }

    sk
}

mod test {
    use crate::utils::point::get_sign_of_point;
    use super::generate_positive_ephemeral_key_pair;

    #[test]
    fn generate_positive_ephemeral_key_pair_produces_positive_keys() {
        // About half of random points are negative, so testing just a couple gives us high confidence that
        // `generate_positive_ephemeral_key_pair` is indeed producing positive ones.
        for _ in 0..10 {
            let (_, pk) = generate_positive_ephemeral_key_pair();
            assert(get_sign_of_point(pk));
        }
    }
}
