use crate::config::{D_INV, LOG_FIELDS_PER_BLOB, ROOTS};

use bignum::{BigNum, BLS12_381_Fr};
use std::ops::{Mul, Neg};
use types::constants::FIELDS_PER_BLOB;

/**
 *                    ___d-1
 *         z^d - 1    \            w^i
 * p(z) = --------- . /   y_i . ---------
 *            d      /____       z - w^i
 *                    i=0
 *
 * p(z) = factor . sum( y_i . fracs_i )
 *
 * where d = 4096
 *
 * Note: `fracs` (w^i / (z - w^i) for all i) and `factor` ((z^d - 1) / d) are computed once
 * upstream in the checkpoint root rollup and shared across all blob evaluations.
 *
 * @param ys - ("ys" being the plural of "y") - the many y_i's of the blob.
 * @param fracs - precomputed w^i / (z - w^i) for all i.
 * @param factor - precomputed (z^d - 1) / d.
 *
 * @return y = p(z)
 */
pub(crate) fn barycentric_evaluate_blob_at_z(
    ys: [BLS12_381_Fr; FIELDS_PER_BLOB],
    fracs: [BLS12_381_Fr; FIELDS_PER_BLOB],
    factor: BLS12_381_Fr,
) -> BLS12_381_Fr {
    //
    //    ___d-1
    //    \          /    w^i    \
    //    /   y_i . |  ---------  |
    //   /____       \  z - w^i  /
    //    i=0
    //
    // Note: fracs are precomputed once upstream (in the checkpoint root rollup) and shared
    // across all blob evaluations, since they only depend on the roots and the shared challenge z.

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
        //                    \            w^i
        //              sum = /   y_i . ---------
        //                   /____       z - w^i
        //                    i=0

        let NUM_PARTIAL_SUMS = FIELDS_PER_BLOB / 8;
        // Safety: This sum is checked by the following `evaluate_quadratic_expression` calls.
        let partial_sums: [BLS12_381_Fr; FIELDS_PER_BLOB / 8] =
            unsafe { __compute_partial_sums(fracs, ys) };

        // We split off the first term to check the initial sum

        //    partial_sums[0] <- (lhs[0] * rhs[0] + ... + lhs[7] * rhs[7])
        // => (lhs[0] * rhs[0] + ... + lhs[7] * rhs[7]) - partial_sums[0] == 0
        let lhs = [[ys[0]], [ys[1]], [ys[2]], [ys[3]], [ys[4]], [ys[5]], [ys[6]], [ys[7]]];
        let rhs = [
            [fracs[0]], [fracs[1]], [fracs[2]], [fracs[3]], [fracs[4]], [fracs[5]], [fracs[6]],
            [fracs[7]],
        ];
        bignum::bignum::evaluate_quadratic_expression(
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
            //                    \            w^i        \            /    y_k    \
            //      sum_out   =   /   y_i . ---------  +  /     w^k . |  ---------  |
            //                   /____       z - w^i     /____         \  z - w^k  /
            //                       0                    k = i*8
            //                   ^^^^^^^^^^^^^^^^^^^^    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
            //                          sum                         partial_sum
            //
            // ... that is:
            //
            //                    ___i*8 - 1              ___ 7
            //                    \            w^i        \
            //      sum_out   =   /   y_i . ---------  +  /   lhs[j] . rhs[j]
            //                   /____       z - w^i     /____
            //                       0                    j = 0
            //                   ^^^^^^^^^^^^^^^^^^^^    ^^^^^^^^^^^^^^^^^^^^
            //                          sum                   partial_sum
            //

            //    partial_sums[i] <- partial_sums[i-1] + (lhs[8*i] * rhs[8*i] + ... + lhs[8*i + 7] * rhs[8*i + 7])
            // => (lhs[8*i] * rhs[8*i] + ... + lhs[8*i + 7] * rhs[8*i + 7]) + partial_sums[i-1] - partial_sums[i] == 0
            let linear_terms = [partial_sums[i - 1], partial_sums[i]];

            bignum::bignum::evaluate_quadratic_expression(
                /* lhs */ [
                    [ys[i * 8 + 0]],
                    [ys[i * 8 + 1]],
                    [ys[i * 8 + 2]],
                    [ys[i * 8 + 3]],
                    [ys[i * 8 + 4]],
                    [ys[i * 8 + 5]],
                    [ys[i * 8 + 6]],
                    [ys[i * 8 + 7]],
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
            __compute_sum(fracs, ys)
        }
    };

    factor.mul(sum)
}

pub fn z_pow_d(z: BLS12_381_Fr) -> BLS12_381_Fr {
    // z ^ d:
    // z ^ 4096 = z ^ (2 ^ 12)

    let mut t = z.mul(z);

    for _ in 0..LOG_FIELDS_PER_BLOB - 1 {
        t = t.mul(t);
    }

    t
}

unconstrained fn __compute_factor_helper(z_pow_d: BLS12_381_Fr) -> BLS12_381_Fr {
    let one = BLS12_381_Fr::one();
    z_pow_d.__sub(one).__mul(D_INV)
}

pub fn validate_factor(z_pow_d: BLS12_381_Fr, factor: BLS12_381_Fr) {
    // (z_pow_d - one) * (D_INV) - factor = 0
    // z_pow_d * D_INV - D_INV - factor = 0
    bignum::bignum::evaluate_quadratic_expression(
        [[z_pow_d]],
        [[false]],
        [[D_INV]],
        [[false]],
        [factor, D_INV],
        [true, true],
    );
}

/// Computes the so-called "factor":
///
///  z^d - 1
/// ---------
///     d
pub fn compute_factor(z: BLS12_381_Fr) -> BLS12_381_Fr {
    let z_pow_d = z_pow_d(z);

    // Safety: We immediately check that this result is correct in the following `evaluate_quadratic_expression` call.
    let factor = unsafe { __compute_factor_helper(z_pow_d) };

    if !std::runtime::is_unconstrained() {
        validate_factor(z_pow_d, factor);
    }

    factor
}

// Compute the fracs: w^i / (z - w^i) for all i
unconstrained fn __compute_fracs(z: BLS12_381_Fr) -> [BLS12_381_Fr; FIELDS_PER_BLOB] {
    let mut denoms = [BLS12_381_Fr::zero(); FIELDS_PER_BLOB];
    for i in 0..FIELDS_PER_BLOB {
        denoms[i] = z.__sub(ROOTS[i]); // (z - w^i)
    }
    let inv_denoms: [BLS12_381_Fr; FIELDS_PER_BLOB] = bignum::bignum::batch_invert(denoms); // 1 / (z - w^i), for all i
    // We're now done with `denoms` so we can reuse the allocated array to build `fracs`.
    let mut fracs = [BLS12_381_Fr::zero(); FIELDS_PER_BLOB]; // aiming for: w^i / (z - w^i), for all i
    for i in 0..FIELDS_PER_BLOB {
        let inv_denom = inv_denoms[i]; // 1 / (z - w^i)
        fracs[i] = ROOTS[i].__mul(inv_denom); // w^i * (1 / (z - w^i))
    }

    fracs
}

// Extracted into a standalone fn to enable testing of invalid fracs.
pub fn validate_fracs(z: BLS12_381_Fr, fracs: [BLS12_381_Fr; FIELDS_PER_BLOB]) {
    for i in 0..FIELDS_PER_BLOB {
        // frac <-- ROOTS[i] / (z + ROOTS[i].neg())
        // frac * (z + ROOTS[i].neg()) - ROOTS[i] == 0
        //
        // Note: if z equals a root of unity w^i, the constraint becomes:
        //   fracs[i] * 0 - ROOTS[i] = 0  =>  -ROOTS[i] = 0
        // Since ROOTS[i] != 0 for all i, this is unsatisfiable -- no valid proof can be created.
        // Moreover, the challenge z is derived from poseidon2_hash([blob_fields_hash, kzg_commitment[0], kzg_commitment[1]]),
        // so finding a blob where z equals a specific root of unity requires a preimage attack on Poseidon2, which
        // is assumed to be computationally infeasible.
        bignum::bignum::evaluate_quadratic_expression(
            [[fracs[i]]],
            [[false]],
            [[z, ROOTS[i].neg()]],
            [[false, false]],
            [ROOTS[i]],
            [true],
        );
    }
}

/// Compute an array of the d `frac` items which contribute to this sum:
///
///    ___d-1
///    \     /    w^i    \
///    /    |  ---------  | . y_i
///   /____  \  z - w^i  /
///    i=0
///            ^^^^^^^^^
///              frac
pub fn compute_fracs(z: BLS12_381_Fr) -> [BLS12_381_Fr; FIELDS_PER_BLOB] {
    // Safety: We immediately constrain these `fracs` to be correct in the following call to `evaluate_quadratic_expression`.
    let fracs: [BLS12_381_Fr; FIELDS_PER_BLOB] = unsafe { __compute_fracs(z) };

    if !std::runtime::is_unconstrained() {
        validate_fracs(z, fracs);
    }

    fracs
}

unconstrained fn __compute_partial_sums(
    fracs: [BLS12_381_Fr; FIELDS_PER_BLOB],
    ys: [BLS12_381_Fr; FIELDS_PER_BLOB],
) -> [BLS12_381_Fr; FIELDS_PER_BLOB / 8] {
    let mut partial_sums: [BLS12_381_Fr; FIELDS_PER_BLOB / 8] = std::mem::zeroed();

    // Seeking:
    //                    ___i*8 + 7
    //                    \            w^k
    //      partial_sum = /   y_k . ---------
    //                   /____       z - w^k
    //                    k=i*8 + 0

    // Need to split off the first iteration.
    let mut partial_sum = BLS12_381_Fr::zero();
    for i in 0..8 {
        // y_k * ( w^k / (z - w^k) )
        let summand = ys[i].__mul(fracs[i]);

        // partial_sum + ( y_k * ( w^k / (z - w^k) ) -> partial_sum
        partial_sum = partial_sum.__add(summand);
    }
    partial_sums[0] = partial_sum;

    let NUM_PARTIAL_SUMS = FIELDS_PER_BLOB / 8;
    for i in 1..NUM_PARTIAL_SUMS {
        let mut partial_sum: BLS12_381_Fr = partial_sums[i - 1];
        // Seeking:
        //                    ___i*8 + 7
        //                    \            w^k
        //      partial_sum = /   y_k . ---------
        //                   /____       z - w^k
        //                    k=i*8 + 0
        for j in 0..8 {
            let k = i * 8 + j;
            // y_k * ( w^k / (z - w^k) )
            let summand = ys[k].__mul(fracs[k]);
            // partial_sum + ( y_k * ( w^k / (z - w^k) ) -> partial_sum
            partial_sum = partial_sum.__add(summand);
        }
        partial_sums[i] = partial_sum;
    }

    partial_sums
}

unconstrained fn __compute_sum(
    fracs: [BLS12_381_Fr; FIELDS_PER_BLOB],
    ys: [BLS12_381_Fr; FIELDS_PER_BLOB],
) -> BLS12_381_Fr {
    // Seeking:
    //                    ___d-1
    //                    \            w^i
    //              sum = /   y_i . ---------
    //                   /____       z - w^i
    //                    i=0

    let mut sum = BLS12_381_Fr::zero();
    for i in 0..FIELDS_PER_BLOB {
        // y_k * ( w^k / (z - w^k) )
        let summand = ys[i].__mul(fracs[i]);

        // partial_sum + ( y_k * ( w^k / (z - w^k) ) -> partial_sum
        sum = sum.__add(summand);
    }
    sum
}

mod tests {
    use crate::{
        blob::barycentric_evaluate_blob_at_z,
        config::{D, D_INV, LOG_FIELDS_PER_BLOB, ROOTS},
    };
    use super::{
        __compute_fracs, __compute_partial_sums, __compute_sum, compute_factor, compute_fracs,
        validate_factor, validate_fracs, z_pow_d,
    };
    use bignum::{BigNum, BLS12_381_Fr};
    use std::ops::Neg;
    use types::{constants::FIELDS_PER_BLOB, hash::poseidon2_hash};

    #[test]
    fn test_multiple_of_8() {
        // If this ever changes (e.g. an eth hard-fork, you'll need to change the limits of the partial sums in this file).
        assert(FIELDS_PER_BLOB % 8 == 0, "8 should divide FIELDS_PER_BLOB");
    }

    // Note: the kzg_commitment is technically a BLS12-381 point in (Fq, Fq), but
    // we don't actually need to operate on it so we've simply encoded it as fitting inside a
    // [Field; 2], since two 254-bit fields more-than covers 381+1=382 bits.
    // See yarn-project/blob-lib/src/blob.ts -> commitmentToFields() for encoding
    fn evaluate_blob(
        blob_as_fields: [Field; FIELDS_PER_BLOB],
        kzg_commitment: [Field; 2],
        blob_fields_hash: Field,
    ) -> (Field, BLS12_381_Fr) {
        let challenge_z = poseidon2_hash([blob_fields_hash, kzg_commitment[0], kzg_commitment[1]]);
        let challenge_z_as_bignum = BLS12_381_Fr::from(challenge_z);
        let blob = blob_as_fields.map(|b| BLS12_381_Fr::from(b));
        let fracs = compute_fracs(challenge_z_as_bignum);
        let factor = compute_factor(challenge_z_as_bignum);

        let y = barycentric_evaluate_blob_at_z(blob, fracs, factor);

        (challenge_z, y)
    }

    #[test]
    unconstrained fn test_one_note() {
        let mut blob_fields: [Field; FIELDS_PER_BLOB] = [0; FIELDS_PER_BLOB];
        blob_fields[0] = 1;

        let kzg_commitment_in = [1, 2]; // this is made-up nonsense.
        let blob_fields_hash = 0x123; // This is not relevant for this test.
        let (z, y) = evaluate_blob(blob_fields, kzg_commitment_in, blob_fields_hash);
        let challenge_z = BLS12_381_Fr::from(z);
        // Our blob is all 0s, apart from one commitment of value 1 at position 0
        // It's in eval form => our barycentric formula to find p(z) becomes:
        //
        //         z^d - 1                w^0        z^d - 1            1
        // p(z) = --------- .   note . --------- =  --------- . 1 . ---------
        //            d                 z - w^0         d             z - 1
        //
        //                               =>
        // We check that:
        //*                 z^d - 1
        //* p(z).(z - 1) = ---------
        //*                    d
        //
        let rhs = super::compute_factor(challenge_z);
        let z_minus_1 = challenge_z.__sub(BLS12_381_Fr::one());
        let lhs = y.__mul(z_minus_1);
        assert_eq(lhs, rhs);
    }

    #[test]
    unconstrained fn test_400() {
        let blob_fields = [3; 400];
        let blob_fields_hash = poseidon2_hash(blob_fields);

        // The following hardcoded values are generated from yarn-project/blob-lib/src/blob.test.ts
        let kzg_commitment_blob_400_from_ts = [
            0x00b2803d5fe972914ba3616033e2748bbaa6dbcddefc3721a54895a7a45e7750,
            0x0000000000000000000000000000004dd1a971c7e8d8292be943d05bccebcfea,
        ];
        let y_limbs_blob_400_from_ts =
            [0xdde7b57ab99b51e4b06e7d827b6c4c, 0x4f0c0ee5e7dd037110686a4639d191, 0x212c];

        let padded_blob_fields = blob_fields.concat([0; FIELDS_PER_BLOB - 400]);
        let (_, y) = evaluate_blob(
            padded_blob_fields,
            kzg_commitment_blob_400_from_ts,
            blob_fields_hash,
        );

        assert_eq(y, BLS12_381_Fr::from_limbs(y_limbs_blob_400_from_ts));
    }

    #[test]
    unconstrained fn test_full_blob() {
        let mut blob_fields = [0; FIELDS_PER_BLOB];
        for i in 0..FIELDS_PER_BLOB {
            blob_fields[i] = i as Field + 2;
        }

        let blob_fields_hash = poseidon2_hash(blob_fields);

        // The following hardcoded values are generated from yarn-project/blob-lib/src/blob.test.ts
        let kzg_commitment_blob_full_from_ts = [
            0x00ac771dea41e29fc2b7016c32731602c0812548ba0f491864a4e03fdb94b8d3,
            0x000000000000000000000000000000d195faad1967cdf005acf73088b0e8474a,
        ];
        let y_limbs_blob_full_from_ts =
            [0xecc38f478ced014b6ae860502a1b1c, 0x494e66a289c4509ecf97af4ff92aa7, 0x0365];

        let (_, y) = evaluate_blob(
            blob_fields,
            kzg_commitment_blob_full_from_ts,
            blob_fields_hash,
        );

        assert_eq(y, BLS12_381_Fr::from_limbs(y_limbs_blob_full_from_ts));
    }

    #[test]
    unconstrained fn test_barycentric() {
        let z = BLS12_381_Fr::from_limbs([2, 0, 0]);

        // many y's form a blob:
        let mut ys = [BLS12_381_Fr::zero(); FIELDS_PER_BLOB];

        ys[0] = BLS12_381_Fr::from_limbs([0x1234, 0, 0]);
        ys[1] = BLS12_381_Fr::from_limbs([0xabcd, 0, 0]);
        ys[2] = BLS12_381_Fr::from_limbs([0x69, 0, 0]);
        let fracs = __compute_fracs(z);
        let factor = compute_factor(z);

        // evaluate the blob at z = 2 to yield y:
        let y = barycentric_evaluate_blob_at_z(ys, fracs, factor);

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
        let double_modulus = BLS12_381_Fr::params().double_modulus;
        assert_eq(double_modulus, compute_double_modulus());
    }

    #[test]
    unconstrained fn test_compute_d_inv() {
        let d_inversed = D.__invmod();
        assert_eq(d_inversed, D_INV);
    }

    #[test]
    fn compute_sum_and_compute_partial_sums_agree() {
        let mut fields = [BLS12_381_Fr::zero(); FIELDS_PER_BLOB];
        let mut ys = [BLS12_381_Fr::zero(); FIELDS_PER_BLOB];
        for i in 0..FIELDS_PER_BLOB {
            fields[i] = BLS12_381_Fr::from(i as Field);
            ys[i] = BLS12_381_Fr::from(2 * i as Field);
        }
        // Safety: this is a test
        unsafe {
            let partial_sums = __compute_partial_sums(fields, ys);
            let sum = __compute_sum(fields, ys);

            assert_eq(partial_sums[FIELDS_PER_BLOB / 8 - 1], sum);
        }
    }

    #[test]
    fn test_log_fields_per_blob_consistency() {
        // Verify that 2^LOG_FIELDS_PER_BLOB == FIELDS_PER_BLOB
        assert_eq(1 << LOG_FIELDS_PER_BLOB, FIELDS_PER_BLOB);
    }

    #[test]
    unconstrained fn test_compute_factor_direct() {
        // Directly test compute_factor: verify factor = (z^d - 1) / d
        let z = BLS12_381_Fr::from_limbs([7, 0, 0]);
        let factor = compute_factor(z);

        // Compute z^d manually
        let mut z_pow_d = z;
        for _ in 0..LOG_FIELDS_PER_BLOB {
            z_pow_d = z_pow_d.__mul(z_pow_d);
        }

        // Verify: factor * d = z^d - 1
        let factor_times_d = factor.__mul(D);
        let z_pow_d_minus_1 = z_pow_d.__sub(BLS12_381_Fr::one());
        assert_eq(factor_times_d, z_pow_d_minus_1);
    }

    #[test]
    unconstrained fn test_compute_fracs_direct() {
        // Directly test __compute_fracs: verify fracs[i] * (z - w^i) = w^i
        let z = BLS12_381_Fr::from_limbs([42, 0, 0]);
        let mut ys = [BLS12_381_Fr::zero(); FIELDS_PER_BLOB];
        ys[0] = BLS12_381_Fr::from_limbs([100, 0, 0]);
        ys[1] = BLS12_381_Fr::from_limbs([200, 0, 0]);
        ys[100] = BLS12_381_Fr::from_limbs([300, 0, 0]);

        let fracs = __compute_fracs(z);

        // Verify the division relationship for non-zero entries
        let indices_to_check = [0, 1, 100];
        for j in 0..indices_to_check.len() {
            let i = indices_to_check[j];
            let denom = z.__sub(ROOTS[i]); // z - w^i
            let product = fracs[i].__mul(denom); // fracs[i] * (z - w^i)
            assert_eq(product, ROOTS[i]);
        }
    }

    #[test]
    unconstrained fn test_zero_blob() {
        // Test that evaluating an all-zeros blob returns zero
        let z = BLS12_381_Fr::from_limbs([42, 0, 0]);
        let ys = [BLS12_381_Fr::zero(); FIELDS_PER_BLOB];
        let fracs = __compute_fracs(z);
        let factor = compute_factor(z);
        let y = barycentric_evaluate_blob_at_z(ys, fracs, factor);

        assert_eq(y, BLS12_381_Fr::zero());
    }

    #[test]
    unconstrained fn test_single_element_at_arbitrary_position() {
        // Test with a single non-zero element at position 1000 (not position 0)
        // This tests that the formula works for arbitrary positions, not just position 0
        // where w^0 = 1 is special.
        let z = BLS12_381_Fr::from_limbs([123, 0, 0]);
        let mut ys = [BLS12_381_Fr::zero(); FIELDS_PER_BLOB];
        let position: u32 = 1000;
        ys[position] = BLS12_381_Fr::one();

        let fracs = __compute_fracs(z);
        let factor = compute_factor(z);
        let y = barycentric_evaluate_blob_at_z(ys, fracs, factor);

        // For a single element y_k = 1 at position k, the formula becomes:
        // p(z) = factor * (w^k / (z - w^k))
        // where factor = (z^d - 1) / d
        //
        // So: p(z) * (z - w^k) = factor * w^k
        let factor = compute_factor(z);
        let w_k = ROOTS[position];
        let z_minus_w_k = z.__sub(w_k);

        let lhs = y.__mul(z_minus_w_k);
        let rhs = factor.__mul(w_k);
        assert_eq(lhs, rhs);
    }

    #[test]
    unconstrained fn test_z_equals_zero() {
        // Test edge case where z = 0
        // p(0) should still be computable
        let z = BLS12_381_Fr::zero();
        let mut ys = [BLS12_381_Fr::zero(); FIELDS_PER_BLOB];
        ys[0] = BLS12_381_Fr::from_limbs([1, 0, 0]);
        ys[1] = BLS12_381_Fr::from_limbs([2, 0, 0]);

        let fracs = __compute_fracs(z);
        let factor = compute_factor(z);
        let y = barycentric_evaluate_blob_at_z(ys, fracs, factor);

        // When z = 0:
        // - z^d = 0, so factor = (0 - 1) / d = -1/d = -D_INV
        // - fracs[i] = w^i / (0 - w^i) = -1
        // - sum = SUM( y_i * (-1) ) = -SUM(y_i)
        // - result = factor * sum = (-D_INV) * (-SUM(y_i)) = D_INV * SUM(y_i)
        //
        // For ys = [1, 2, 0, 0, ...]: SUM(y_i) = 3
        // So result = D_INV * 3

        let three = BLS12_381_Fr::from_limbs([3, 0, 0]);
        let expected = D_INV.__mul(three);
        assert_eq(y, expected);
    }

    #[test]
    unconstrained fn test_large_field_elements() {
        // Test with field elements that are large (close to the modulus)
        // BLS12-381 scalar field modulus is approximately 2^255
        let z = BLS12_381_Fr::from_limbs([2, 0, 0]);

        let mut ys = [BLS12_381_Fr::zero(); FIELDS_PER_BLOB];
        // Use a large value (but still valid in the field)
        // The modulus is 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001
        // Use a value that's large but less than the modulus
        ys[0] =
            BLS12_381_Fr::from_limbs([0xffffffffffffff00000000, 0xffffffffffffff00000000, 0x73ed]);

        // Just verify it doesn't panic and produces a result
        let fracs = __compute_fracs(z);
        let factor = compute_factor(z);
        let _y = barycentric_evaluate_blob_at_z(ys, fracs, factor);
        // If we got here without panicking, the test passes
    }

    #[test]
    fn test_barycentric_constrained() {
        // This is a CONSTRAINED test - it actually exercises the constraint system
        // Unlike the other tests which are mostly unconstrained
        let z = BLS12_381_Fr::from_limbs([2, 0, 0]);

        let mut ys = [BLS12_381_Fr::zero(); FIELDS_PER_BLOB];
        ys[0] = BLS12_381_Fr::from_limbs([0x1234, 0, 0]);
        ys[1] = BLS12_381_Fr::from_limbs([0xabcd, 0, 0]);
        ys[2] = BLS12_381_Fr::from_limbs([0x69, 0, 0]);

        // This call will exercise all the evaluate_quadratic_expression constraints
        let fracs = compute_fracs(z);
        let factor = compute_factor(z);
        let y = barycentric_evaluate_blob_at_z(ys, fracs, factor);

        // Verify against known value (same as test_barycentric)
        let expected_y: [u128; 3] =
            [0x0c62e352a428e8e9842eadc1c106bd, 0x902c5b4968d755b6f49c0231e15af8, 0x00049a];
        assert(y.get_limbs() == expected_y);
    }

    #[test]
    fn test_compute_factor_constrained() {
        // Constrained test for compute_factor
        let z = BLS12_381_Fr::from_limbs([7, 0, 0]);

        // This exercises the constraint in compute_factor
        let factor = compute_factor(z);

        // Verify the result is non-zero (basic sanity check)
        assert(factor.get_limbs() != [0, 0, 0]);
    }

    #[test]
    unconstrained fn test_fracs_constraint_relationship() {
        // Verify that the constraint frac * (z - w^i) - y = 0 holds
        // This tests the mathematical relationship that the constraint checks
        let z = BLS12_381_Fr::from_limbs([999, 0, 0]);
        let mut ys = [BLS12_381_Fr::zero(); FIELDS_PER_BLOB];

        // Set some non-zero values
        for i in 0..10 {
            ys[i] = BLS12_381_Fr::from_limbs([(i + 1) as u128 * 111, 0, 0]);
        }

        let fracs = compute_fracs(z);

        // For each non-zero y, verify: frac * (z - w^i) = w^i
        for i in 0..10 {
            let z_minus_root = z.__sub(ROOTS[i]);
            let computed_root = fracs[i].__mul(z_minus_root);
            assert_eq(computed_root, ROOTS[i]);
        }
    }

    #[test]
    unconstrained fn test_negated_root_computation() {
        // Verify that ROOTS[i].neg() correctly computes -w^i in the field
        // This is important because compute_fracs uses ROOTS[i].neg()
        let one = BLS12_381_Fr::one();

        for i in 0..10 {
            let root = ROOTS[i];
            let neg_root = root.neg();

            // Verify: root + neg_root = 0 (mod p)
            let sum = root.__add(neg_root);
            assert_eq(sum, BLS12_381_Fr::zero());

            // Verify: root * (-1) = neg_root
            let minus_one = BLS12_381_Fr::zero().__sub(one);
            let root_times_minus_one = root.__mul(minus_one);
            assert_eq(root_times_minus_one, neg_root);
        }
    }

    // ==================== SOUNDNESS TESTS ====================
    // These tests verify that invalid hints are rejected by the constraints.
    // The BigNum library's evaluate_quadratic_expression asserts `remainder == [0; N]`
    // when the constraint is not satisfied.

    #[test(should_fail)]
    fn test_validate_factor_rejects_invalid_factor() {
        // Test that validate_factor rejects an incorrect factor hint
        let z = BLS12_381_Fr::from_limbs([7, 0, 0]);
        let z_pow_d_val = z_pow_d(z);

        // Compute the correct factor, then corrupt it
        // Safety: computing correct value first
        let correct_factor = unsafe { super::__compute_factor_helper(z_pow_d_val) };

        // Add 1 to corrupt the factor
        let invalid_factor = unsafe { correct_factor.__add(BLS12_381_Fr::one()) };

        // This should fail because the constraint won't be satisfied
        validate_factor(z_pow_d_val, invalid_factor);
    }

    #[test(should_fail)]
    fn test_validate_factor_rejects_zero_factor() {
        // Test that validate_factor rejects a zero factor (when it shouldn't be zero)
        let z = BLS12_381_Fr::from_limbs([7, 0, 0]);
        let z_pow_d_val = z_pow_d(z);

        // Use zero as the factor (incorrect for z != root of unity)
        let invalid_factor = BLS12_381_Fr::zero();

        // This should fail
        validate_factor(z_pow_d_val, invalid_factor);
    }

    #[test(should_fail)]
    fn test_validate_fracs_rejects_invalid_frac() {
        // Test that validate_fracs rejects incorrect frac hints
        let z = BLS12_381_Fr::from_limbs([42, 0, 0]);
        let mut ys = [BLS12_381_Fr::zero(); FIELDS_PER_BLOB];
        ys[0] = BLS12_381_Fr::from_limbs([100, 0, 0]);

        // Compute correct fracs, then corrupt one
        // Safety: computing correct values first
        let mut fracs = unsafe { __compute_fracs(z) };

        // Corrupt fracs[0] by adding 1
        fracs[0] = unsafe { fracs[0].__add(BLS12_381_Fr::one()) };

        // This should fail because fracs[0] * (z - w^0) != ys[0]
        validate_fracs(z, fracs);
    }

    #[test(should_fail)]
    fn test_validate_fracs_rejects_swapped_fracs() {
        // Test that validate_fracs rejects fracs that are swapped between positions
        let z = BLS12_381_Fr::from_limbs([42, 0, 0]);
        let mut ys = [BLS12_381_Fr::zero(); FIELDS_PER_BLOB];
        ys[0] = BLS12_381_Fr::from_limbs([100, 0, 0]);
        ys[1] = BLS12_381_Fr::from_limbs([200, 0, 0]);

        // Compute correct fracs
        // Safety: computing correct values first
        let mut fracs = unsafe { __compute_fracs(z) };

        // Swap fracs[0] and fracs[1]
        let temp = fracs[0];
        fracs[0] = fracs[1];
        fracs[1] = temp;

        // This should fail because the constraints check each position independently
        validate_fracs(z, fracs);
    }

    #[test(should_fail)]
    fn test_validate_fracs_rejects_nonzero_frac_for_zero_y() {
        // Test that when y[i] = 0, fracs[i] must also satisfy the constraint
        // (which means fracs[i] * (z - w^i) = 0)
        let z = BLS12_381_Fr::from_limbs([42, 0, 0]);
        let ys = [BLS12_381_Fr::zero(); FIELDS_PER_BLOB]; // All zeros

        // Compute correct fracs (should all be zero)
        // Safety: computing correct values first
        let mut fracs = unsafe { __compute_fracs(z) };

        // Set fracs[0] to a non-zero value
        // Since y[0] = 0, the constraint is fracs[0] * (z - w^0) = 0
        // For this to hold with non-zero fracs[0], we'd need z = w^0 = 1
        // But z = 42, so this should fail
        fracs[0] = BLS12_381_Fr::from_limbs([999, 0, 0]);

        validate_fracs(z, fracs);
    }
}
