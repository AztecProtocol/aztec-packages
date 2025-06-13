use crate::config::{D_INV, LOG_FIELDS_PER_BLOB, ROOTS};

use bigint::{BigNum, BLS12_381_Fr as F};
use std::ops::{Mul, Neg};
use types::constants::FIELDS_PER_BLOB;

/**
 *                    ___d-1
 *         z^d - 1    \            omega^i
 * p(z) = --------- . /   y_i . ---------
 *            d      /____       z - omega^i
 *                    i=0
 *
 * p(z) = factor . sum( y_i . num / denom )
 *
 *
 * where d = 4096
 *
 * Precompute:
 * - The d roots of unity omega^i (plus maybe their negatives for z - omega^i computations).
 * - (1 / d)
 *
 * @param z
 * @param ys - the many y_i's of the blob.
 *
 * @return y = p(z)
 */
pub(crate) fn barycentric_evaluate_blob_at_z(z: F, ys: [F; FIELDS_PER_BLOB]) -> F {
    // Note: it's more efficient (saving 30k constraints) to compute:
    //    ___d-1
    //    \     /    y_i    \
    //    /    |  ---------  | . omega^i
    //   /____  \  z - omega^i  /
    //    i=0
    //            ^^^^^^^^^
    //              frac
    //
    // ... than to compute:
    //
    //    ___d-1
    //    \          /    omega^i    \
    //    /   y_i . |  ---------  |
    //   /____       \  z - omega^i  /
    //    i=0
    //
    // perhaps because all the omega^i terms are constant witnesses?
    let fracs = compute_fracs(z, ys);

    let sum = if !std::runtime::is_unconstrained() {
        // OK so...we can add multiple product terms into a sum...but I am not sure how many!
        // we are computing 254 * 254 bit products and we need to ensure each product limb doesn't overflow
        // each limb is 120 bits => 120 * 120 = 240 bits.
        // however when computing a mul we add up to 5 product terms into a single field element => 243 bits (ish)
        // when we do a modular reduction we validate that a field element >> 120 bits is less than 2^{126} which implies we have 246 bits to play with
        // which implies...we can accommodate up to EIGHT additions of product terms before we risk overflowing
        // (this is really messy! I never considered the case of giant linear sequences of products)

        // Seeking:
        //                    ___d-1
        //                    \            omega^i
        //              sum = /   y_i . ---------
        //                   /____       z - omega^i
        //                    i=0

        let NUM_PARTIAL_SUMS = FIELDS_PER_BLOB / 8;
        // Safety: This sum is checked by the following `F::evaluate_quadratic_expression` calls.
        let partial_sums: [F; FIELDS_PER_BLOB / 8] = unsafe { __compute_partial_sums(fracs) };

        // We split off the first term to check the initial sum

        //    partial_sums[0] <- (lhs[0] * rhs[0] + ... + lhs[7] * rhs[7])
        // => (lhs[0] * rhs[0] + ... + lhs[7] * rhs[7]) - partial_sums[0] == 0
        let lhs = [
            [ROOTS[0]], [ROOTS[1]], [ROOTS[2]], [ROOTS[3]], [ROOTS[4]], [ROOTS[5]], [ROOTS[6]],
            [ROOTS[7]],
        ];
        let rhs = [
            [fracs[0]], [fracs[1]], [fracs[2]], [fracs[3]], [fracs[4]], [fracs[5]], [fracs[6]],
            [fracs[7]],
        ];
        bigint::bignum::evaluate_quadratic_expression(
            lhs,
            [[false], [false], [false], [false], [false], [false], [false], [false]],
            rhs,
            [[false], [false], [false], [false], [false], [false], [false], [false]],
            [partial_sums[0]],
            [true],
        );
        for i in 1..NUM_PARTIAL_SUMS {
            // Seeking:
            //                    ___i*8 - 1              ___i*8 + 7
            //                    \            omega^i        \            /    y_k    \
            //      sum_out   =   /   y_i . ---------  +  /     omega^k . |  ---------  |
            //                   /____       z - omega^i     /____         \  z - omega^k  /
            //                       0                    k = i*8
            //                   ^^^^^^^^^^^^^^^^^^^^    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
            //                          sum                         partial_sum
            //
            // ... that is:
            //
            //                    ___i*8 - 1              ___ 7
            //                    \            omega^i        \
            //      sum_out   =   /   y_i . ---------  +  /   lhs[j] . rhs[j]
            //                   /____       z - omega^i     /____
            //                       0                    j = 0
            //                   ^^^^^^^^^^^^^^^^^^^^    ^^^^^^^^^^^^^^^^^^^^
            //                          sum                   partial_sum
            //

            //    partial_sums[i] <- partial_sums[i-1] + (lhs[8*i] * rhs[8*i] + ... + lhs[8*i + 7] * rhs[8*i + 7])
            // => (lhs[8*i] * rhs[8*i] + ... + lhs[8*i + 7] * rhs[8*i + 7]) + partial_sums[i-1] - partial_sums[i] == 0
            let linear_terms = [partial_sums[i - 1], partial_sums[i]];

            bigint::bignum::evaluate_quadratic_expression(
                /* lhs */ [
                    [ROOTS[i * 8 + 0]],
                    [ROOTS[i * 8 + 1]],
                    [ROOTS[i * 8 + 2]],
                    [ROOTS[i * 8 + 3]],
                    [ROOTS[i * 8 + 4]],
                    [ROOTS[i * 8 + 5]],
                    [ROOTS[i * 8 + 6]],
                    [ROOTS[i * 8 + 7]],
                ],
                [[false], [false], [false], [false], [false], [false], [false], [false]],
                /* rhs */
                [
                    [fracs[i * 8 + 0]],
                    [fracs[i * 8 + 1]],
                    [fracs[i * 8 + 2]],
                    [fracs[i * 8 + 3]],
                    [fracs[i * 8 + 4]],
                    [fracs[i * 8 + 5]],
                    [fracs[i * 8 + 6]],
                    [fracs[i * 8 + 7]],
                ],
                [[false], [false], [false], [false], [false], [false], [false], [false]],
                linear_terms,
                [false, true],
            );
        }

        // The final term in `partial_sums` is then the full sum.
        partial_sums[FIELDS_PER_BLOB / 8 - 1]
    } else {
        // There's no need to jump through hoops to check partial sums if we don't need to constrain the result.
        // We can just calculate the final sum.

        // Safety: We're running under the condition that `std::runtime::is_unconstrained()` is true.
        unsafe {
            __compute_sum(fracs)
        }
    };

    let factor = compute_factor(z);
    factor.mul(sum)
}

unconstrained fn __compute_factor_helper(z_pow_d: F) -> F {
    let one: F = F::one();
    z_pow_d.__sub(one).__mul(D_INV)
}

fn compute_factor(z: F) -> F {
    // z ^ D:
    let mut t = z.mul(z);

    for _ in 0..LOG_FIELDS_PER_BLOB - 1 {
        t = t.mul(t);
    }

    let z_pow_d = t;

    // Safety: We immediately check that this result is correct in the following
    // `F::evaluate_quadratic_expression` call.
    let factor = unsafe { __compute_factor_helper(z_pow_d) };

    // (z_pow_d - one) * (D_INV) - factor = 0
    // z_pow_d * D_INV - D_INV - factor = 0
    if !std::runtime::is_unconstrained() {
        bigint::bignum::evaluate_quadratic_expression(
            [[z_pow_d]],
            [[false]],
            [[D_INV]],
            [[false]],
            [factor, D_INV],
            [true, true],
        );
    }

    // This version doesn't work:
    // F::evaluate_quadratic_expression(
    //     [[z_pow_d, one]],
    //     [[false, true]],
    //     [[D_INV]],
    //     [[false]],
    //     [factor],
    //     [true]
    // );

    factor
}

unconstrained fn __compute_fracs(z: F, ys: [F; FIELDS_PER_BLOB]) -> [F; FIELDS_PER_BLOB] {
    let mut denoms = [F::zero(); FIELDS_PER_BLOB];
    for i in 0..FIELDS_PER_BLOB {
        denoms[i] = z.__sub(ROOTS[i]); // (z - omega^i)
    }
    let inv_denoms: [F; FIELDS_PER_BLOB] = bigint::bignum::batch_invert(denoms); // 1 / (z - omega^i), for all i
    // We're now done with `denoms` so we can reuse the allocated array to build `fracs`.
    let mut fracs: [F; FIELDS_PER_BLOB] = denoms; // y_i / (z - omega^i), for all i
    for i in 0..FIELDS_PER_BLOB {
        let num = ys[i];
        let inv_denom = inv_denoms[i]; // 1 / (z - omega^i)
        fracs[i] = num.__mul(inv_denom); // y_i * (1 / (z - omega^i))
    }

    fracs
}

fn compute_fracs(z: F, ys: [F; FIELDS_PER_BLOB]) -> [F; FIELDS_PER_BLOB] {
    // Safety: We immediately constrain these `fracs` to be correct in the following call
    // to `F::evaluate_quadratic_expression`.
    let mut fracs: [F; FIELDS_PER_BLOB] = unsafe { __compute_fracs(z, ys) };

    if !std::runtime::is_unconstrained() {
        for i in 0..FIELDS_PER_BLOB {
            // frac <-- ys[i] / (z + neg_roots[i])
            // frac * (z + neg_roots[i]) - ys[i] = 0
            bigint::bignum::evaluate_quadratic_expression(
                [[fracs[i]]],
                [[false]],
                [[z, ROOTS[i].neg()]],
                [[false, false]],
                [ys[i]],
                [true],
            );
        }
    }

    fracs
}

// TODO: Clean me
unconstrained fn __compute_partial_sums(fracs: [F; FIELDS_PER_BLOB]) -> [F; FIELDS_PER_BLOB / 8] {
    let mut partial_sums: [F; FIELDS_PER_BLOB / 8] = std::mem::zeroed();

    // Seeking:
    //                    ___i*8 + 7
    //                    \            omega^k
    //      partial_sum = /   y_k . ---------
    //                   /____       z - omega^k
    //                    k=i*8 + 0

    // Need to split off the first iteration.
    let mut partial_sum: F = F::zero();
    for i in 0..8 {
        // y_k * ( omega^k / (z - omega^k) )
        let summand = ROOTS[i].__mul(fracs[i]);

        // partial_sum + ( y_k * ( omega^k / (z - omega^k) ) -> partial_sum
        partial_sum = partial_sum.__add(summand);
    }
    partial_sums[0] = partial_sum;

    let NUM_PARTIAL_SUMS = FIELDS_PER_BLOB / 8;
    for i in 1..NUM_PARTIAL_SUMS {
        let mut partial_sum: F = partial_sums[i - 1];
        // Seeking:
        //                    ___i*8 + 7
        //                    \            omega^k
        //      partial_sum = /   y_k . ---------
        //                   /____       z - omega^k
        //                    k=i*8 + 0
        for j in 0..8 {
            let k = i * 8 + j;
            // y_k * ( omega^k / (z - omega^k) )
            let summand = ROOTS[k].__mul(fracs[k]);
            // partial_sum + ( y_k * ( omega^k / (z - omega^k) ) -> partial_sum
            partial_sum = partial_sum.__add(summand);
        }
        partial_sums[i] = partial_sum;
    }

    partial_sums
}

unconstrained fn __compute_sum(fracs: [F; FIELDS_PER_BLOB]) -> F {
    // Seeking:
    //                    ___d-1
    //                    \            omega^i
    //              sum = /   y_i . ---------
    //                   /____       z - omega^i
    //                    i=0

    let mut sum: F = F::zero();
    for i in 0..FIELDS_PER_BLOB {
        // y_k * ( omega^k / (z - omega^k) )
        let summand = ROOTS[i].__mul(fracs[i]);

        // partial_sum + ( y_k * ( omega^k / (z - omega^k) ) -> partial_sum
        sum = sum.__add(summand);
    }
    sum
}

mod tests {
    // TODO(#9982): Replace unconstrained_config with config and import ROOTS - calculating ROOTS in unconstrained is insecure.
    use crate::{blob::barycentric_evaluate_blob_at_z, config::{D, D_INV}};
    use super::{__compute_partial_sums, __compute_sum};
    use bigint::{BigNum, BLS12_381_Fr as F};
    use types::{
        abis::sponge_blob::SpongeBlob,
        constants::FIELDS_PER_BLOB,
        tests::fixture_builder::FixtureBuilder,
        traits::{Empty, Serialize},
    };

    // Note: the kzg_commitment is technically a BLS12-381 point in (Fq, Fq), but
    // we don't actually need to operate on it so we've simply encoded it as fitting inside a
    // [Field; 2], since two 254-bit fields more-than covers 381+1=382 bits.
    // See yarn-project/foundation/src/blob/index.ts -> commitmentToFields() for encoding
    pub struct TestBlobEvaluationOutputs {
        pub z: Field,
        pub y: F,
        pub c: [Field; 2],
    }

    impl Empty for TestBlobEvaluationOutputs {
        fn empty() -> Self {
            Self { z: 0, y: F::zero(), c: [0, 0] }
        }
    }

    fn evaluate_blob(
        blob_as_fields: [Field; FIELDS_PER_BLOB],
        kzg_commitment: [Field; 2],
        hashed_blobs_fields: Field,
    ) -> TestBlobEvaluationOutputs {
        let challenge_z = poseidon::poseidon2::Poseidon2::hash(
            [hashed_blobs_fields, kzg_commitment[0], kzg_commitment[1]],
            3,
        );
        let challenge_z_as_bignum = F::from(challenge_z);
        let blob = blob_as_fields.map(|b| F::from(b));

        let y: F = barycentric_evaluate_blob_at_z(challenge_z_as_bignum, blob);

        TestBlobEvaluationOutputs { z: challenge_z, y, c: kzg_commitment }
    }

    #[test]
    unconstrained fn test_one_note() {
        let mut tx_data = FixtureBuilder::new();
        tx_data.add_new_note_hash(1);
        let mut blob: [Field; FIELDS_PER_BLOB] = [0; FIELDS_PER_BLOB];
        let blob_fields = tx_data.to_private_to_rollup_accumulated_data().serialize();
        for i in 0..blob_fields.len() {
            blob[i] = blob_fields[i];
        }
        let mut sponge_blob = SpongeBlob::new(blob_fields.len());
        sponge_blob.absorb(blob_fields, blob_fields.len());

        let kzg_commitment_in = [1, 2]; // this is made-up nonsense.
        let hashed_blob = sponge_blob.squeeze();
        let output = evaluate_blob(blob, kzg_commitment_in, hashed_blob);
        let challenge_z = F::from(output.z);
        let y = output.y;
        // Our blob is all 0s, apart from one commitment of value 1 at position 0
        // It's in eval form => our barycentric formula to find p(z) becomes:
        //
        //         z^d - 1              omega^0      z^d - 1            1
        // p(z) = --------- .   note . --------- =  --------- . 1 . ---------
        //            d               z - omega^0       d             z - 1
        //
        //                               =>
        // We check that:
        //*                 z^d - 1
        //* p(z).(z - 1) = ---------
        //*                    d
        //
        let rhs = super::compute_factor(challenge_z);
        let z_minus_1 = challenge_z.__sub(F::one());
        let lhs = y.__mul(z_minus_1);
        assert_eq(lhs, rhs);
    }

    // All hardcoded values in this test are taken from yarn-project/foundation/src/blob/blob.test.ts -> 'should evaluate a blob of 400 items'
    #[test]
    unconstrained fn test_400() {
        let mut blob: [Field; FIELDS_PER_BLOB] = [0; FIELDS_PER_BLOB];
        for i in 0..400 {
            blob[i] = 3;
        }
        let mut sponge_blob = SpongeBlob::new(400);
        sponge_blob.absorb(blob, 400);

        let kzg_commitment_in = [
            0x00b2803d5fe972914ba3616033e2748bbaa6dbcddefc3721a54895a7a45e7750,
            0x0000000000000000000000000000004dd1a971c7e8d8292be943d05bccebcfea,
        ];

        let hashed_blob = sponge_blob.squeeze();
        let output = evaluate_blob(blob, kzg_commitment_in, hashed_blob);

        // y is a BLS field with value 0x212c4f0c0ee5e7dd037110686a4639d191dde7b57ab99b51e4b06e7d827b6c4c
        let expected_y: F = F::from_limbs([
            0xdde7b57ab99b51e4b06e7d827b6c4c,
            0x4f0c0ee5e7dd037110686a4639d191,
            0x212c,
        ]);
        assert(expected_y == output.y);
    }

    // All hardcoded values in this test are taken from yarn-project/foundation/src/blob/blob.test.ts -> 'should evaluate full blob'
    #[test]
    unconstrained fn test_full_blob() {
        let mut blob: [Field; FIELDS_PER_BLOB] = [0; FIELDS_PER_BLOB];
        for i in 0..FIELDS_PER_BLOB {
            blob[i] = i as Field + 2;
        }
        let mut sponge_blob = SpongeBlob::new(FIELDS_PER_BLOB);
        sponge_blob.absorb(blob, FIELDS_PER_BLOB);

        let kzg_commitment_in = [
            0x00ac771dea41e29fc2b7016c32731602c0812548ba0f491864a4e03fdb94b8d3,
            0x000000000000000000000000000000d195faad1967cdf005acf73088b0e8474a,
        ];

        let hashed_blob = sponge_blob.squeeze();
        let output = evaluate_blob(blob, kzg_commitment_in, hashed_blob);

        // y is a BLS field with value 0x0365494e66a289c4509ecf97af4ff92aa7ecc38f478ced014b6ae860502a1b1c
        let expected_y: F = F::from_limbs([
            0xecc38f478ced014b6ae860502a1b1c,
            0x494e66a289c4509ecf97af4ff92aa7,
            0x0365,
        ]);
        assert(expected_y == output.y);
    }

    #[test]
    unconstrained fn test_barycentric() {
        let z: F = F::from_limbs([2, 0, 0]);

        // many y's form a blob:
        let mut ys: [F; FIELDS_PER_BLOB] = [F::zero(); FIELDS_PER_BLOB];

        ys[0] = F::from_limbs([0x1234, 0, 0]);
        ys[1] = F::from_limbs([0xabcd, 0, 0]);
        ys[2] = F::from_limbs([0x69, 0, 0]);

        // evaluate the blob at z = 2 to yield y:
        let y = barycentric_evaluate_blob_at_z(z, ys);

        let mut expected_y: [u128; 3] = [0; 3];
        if (FIELDS_PER_BLOB == 4096) {
            // Computed with the eth consensus specs py lib
            expected_y =
                [0x0c62e352a428e8e9842eadc1c106bd, 0x902c5b4968d755b6f49c0231e15af8, 0x00049a];
            // Also computed with cKzg, in the typescript tests:
            // 0x049a902c5b4968d755b6f49c0231e15af80c62e352a428e8e9842eadc1c106bd
        }
        if (FIELDS_PER_BLOB == 8) {
            // Computed with the eth consensus specs py lib (after hacking it to cope with blobs of size 8 instead of 4096):
            expected_y =
                [0xb04cdea4304000053abffffffb203a, 0x0000000002e30785c8afa4496f8e38, 0x000000];
        }
        assert(y.get_limbs() == expected_y);
    }

    // Helper function used to populate the hard-coded double_modulus value in the bls12381Fr.nr file in the bignum library.
    unconstrained fn compute_double_modulus() -> [u128; 3] {
        let two_p = [0x7b4805fffcb7fdfffffffe00000002, 0x4ea6533afa906673b0101343b00aa7, 0x00e7db];
        let NUM_LIMBS = 3; // must be >= 3
        let two_pow_120: u128 = 2.pow_32(120) as u128;
        let mut double_modulus: [u128; 3] = [0; 3];

        double_modulus[0] = two_p[0] + two_pow_120;
        for i in 1..NUM_LIMBS - 1 {
            double_modulus[i] = two_p[i] + two_pow_120 - 1;
        }
        double_modulus[NUM_LIMBS - 1] = two_p[NUM_LIMBS - 1] - 1;
        double_modulus
    }

    #[test]
    unconstrained fn test_compute_double_modulus() {
        let double_modulus = F::params().double_modulus;
        assert_eq(double_modulus, compute_double_modulus());
    }

    #[test]
    unconstrained fn test_compute_d_inv() {
        let d_inversed = D.__invmod();
        assert_eq(d_inversed, D_INV);
    }

    #[test]
    fn compute_sum_and_compute_partial_sums_agree() {
        let mut fields = [F::zero(); FIELDS_PER_BLOB];
        for i in 0..FIELDS_PER_BLOB {
            fields[i] = F::from(i as Field);
        }
        // Safety: this is a test
        unsafe {
            let partial_sums = __compute_partial_sums(fields);
            let sum = __compute_sum(fields);

            assert_eq(partial_sums[FIELDS_PER_BLOB / 8 - 1], sum);
        }
    }
}
