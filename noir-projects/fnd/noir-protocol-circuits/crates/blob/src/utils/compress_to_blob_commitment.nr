use crate::abis::{batching_blob_commitment::BatchingBlobCommitment, BLSPoint};
use super::validate_canonical_representation_if_infinity;
use bignum::{BigNum, BLS12_381_Fq};

// TODO(MW): get_flags() and compress_to_bytes() will eventually be part of BigCurve.
/**
 * Create a compressed representation of a BLS12Point.
 * @dev NOTE: The compression standard for BLS12-381 differs from BN curves. Instead of
 * one is_positive flag, we have three flags to prepend:
 * - is_compressed: indicator that the point is compressed
 * - is_infinity: whether the point the point at infinity
 * - is_greater: only set if is_compressed && !is_infinity && y > (p - 1)/2
 * See https://github.com/arkworks-rs/algebra/blob/master/curves/bls12_381/src/curves/g1.rs -> serialize_with_mode() -> encoding
 * and noble-curves/src/bls12-381.ts -> setMask()
 */
pub fn compress_to_blob_commitment(point: BLSPoint) -> (BatchingBlobCommitment) {
    // A point at infinity must be canonically encoded (x == 0 && y == 0); otherwise a non-zero
    // coordinate would leak into the compressed output and produce a non-canonical encoding.
    validate_canonical_representation_if_infinity(point);
    let (flags, x) = get_flags(point);
    let mut compressed = x.to_be_bytes();
    let most_sig_bits: [bool; 8] = (compressed[0] as Field).to_be_bits();
    for i in 0..3 {
        assert_eq(most_sig_bits[i], false, "Invalid BLS12-381 x coordinate given to compress().");
    }
    compressed[0] = set_flags(flags, compressed[0]);
    BatchingBlobCommitment { point, compressed }
}

// TODO: Will be part of bigcurve's compression functionality
// Given a point in BLS12-381, returns [is_compressed, is_infinity, is_greater] and the point's x coordinate
fn get_flags(point: BLSPoint) -> ([bool; 3], BLS12_381_Fq) {
    let x = point.x;
    let y = point.y;
    let is_compressed = true;
    let is_infinity = point.is_infinity;
    let is_greater = y > -y;
    let flags = [is_compressed, is_infinity, is_greater];
    (flags, x)
}

// TODO(MW): Will be part of bigcurve's compression functionality
// Given [is_compressed, is_infinity, is_greater] and the point's most significant byte, returns that
// byte with the flags set.
fn set_flags(flags: [bool; 3], byte: u8) -> u8 {
    let mut flip = 0;
    // flags = [is_compressed, is_infinity, is_greater]
    // if (is_compressed) { flip most sig bit in u8 => byte |= 1 << 7 }
    // if (is_infinity) { flip next most sig bit in u8 => byte |= 1 << 6 }
    // if (is_greater) { flip next most sig bit in u8 => byte |= 1 << 5 }
    for i in 0..3 {
        if flags[i] {
            flip += 1 << (7 - (i as u8));
        }
    }
    byte + flip
}

mod tests {
    use crate::abis::BLSPoint;
    use super::{compress_to_blob_commitment, get_flags};
    use bigcurve::{BigCurve, curves::bls12_381::BLS12_381_PARAMS};
    use bignum::{BigNum, BLS12_381_Fq};
    use std::ops::{Add, Mul};
    use types::constants::BLS12_POINT_COMPRESSED_BYTES;

    #[test]
    unconstrained fn point_compression() {
        let point = BLSPoint::offset_generator();
        let (flags, x) = get_flags(point);
        // is_compressed = true
        assert_eq(flags[0], true);
        // is_infinity = false
        assert_eq(flags[1], false);
        // is_greater = false: the BLS12-381 offset generator's y is the lower root (y < -y)
        assert_eq(flags[2], false);
        // Decompress back to the same point:
        let mut bytes = compress_to_blob_commitment(point).compressed;
        // Same as &= 0b0001_1111 - clear first three bits of our flags
        bytes[0] &= 31;
        let reconstructed_x = BLS12_381_Fq::from_be_bytes(bytes);
        assert_eq(reconstructed_x, x);
        let (a, b) = (BLS12_381_PARAMS.a, BLS12_381_PARAMS.b);
        // y^2 = x^3 + ax + b
        let reconstructed_y_squared =
            reconstructed_x.__pow(&BLS12_381_Fq::from(3)).add(a.mul(reconstructed_x)).add(b);
        // Pick the square root whose ordering matches the is_greater flag.
        let root = reconstructed_y_squared.__sqrt().unwrap();
        let reconstructed_y = if (root > -root) == flags[2] {
            root
        } else {
            -root
        };

        assert_eq(reconstructed_y, point.y);
    }

    // x = 6 + q: in range limb-wise and still on the curve, but not the canonical encoding of the point.
    // Compression must reject it (`to_be_bytes` range-checks x against q), since L1 compares the bytes.
    #[test(should_fail)]
    fn non_canonical_x_is_rejected() {
        let point = BLSPoint {
            x: BLS12_381_Fq::from_limbs([
                0xabfffeb153ffffb9feffffffffaab1,
                0x4b84f38512bf6730d2a0f6b0f6241e,
                0xea397fe69a4b1ba7b6434bacd76477,
                0x1a0111,
            ]),
            y: BLS12_381_Fq::from_limbs([
                0x7991ee2150c45aa818e09c22df3b39,
                0xa9f859c6f15d3a7ced587ae40ecf69,
                0x1462f2e82445342f837b384cb8f008,
                0x5116d,
            ]),
            is_infinity: false,
        };
        point.validate_on_curve();
        let _ = compress_to_blob_commitment(point);
    }

    #[test]
    fn infinity_point_compression() {
        let point = BLSPoint::point_at_infinity();
        let (flags, x) = get_flags(point);
        // is_compressed = true
        assert_eq(flags[0], true);
        // is_infinity = true
        assert_eq(flags[1], true);
        // is_greater = false (is infinity)
        assert_eq(flags[2], false);

        assert_eq(x, BLS12_381_Fq::zero());

        // check compression
        let mut expected_bytes = [0; BLS12_POINT_COMPRESSED_BYTES];
        expected_bytes[0] = 0xc0; // 0b11000000
        assert_eq(expected_bytes, compress_to_blob_commitment(point).compressed);
    }

    #[test(should_fail_with = "Non canonical x coordinate at infinity")]
    fn non_canonical_infinity_point_fails() {
        let point =
            BLSPoint { x: BLS12_381_Fq::from(1), y: BLS12_381_Fq::zero(), is_infinity: true };
        let _ = compress_to_blob_commitment(point);
    }

    #[test(should_fail_with = "Non canonical y coordinate at infinity")]
    fn non_canonical_infinity_point_y_fails() {
        // x is canonical (0) but y is not: the y-coordinate check must still reject it.
        let point =
            BLSPoint { x: BLS12_381_Fq::zero(), y: BLS12_381_Fq::from(1), is_infinity: true };
        let _ = compress_to_blob_commitment(point);
    }

    #[test(should_fail_with = "Non canonical y coordinate at infinity")]
    fn modulus_y_infinity_point_fails() {
        // y == modulus is zero modulo the field, but its limbs would set the sort flag and
        // produce a 0xe0 prefix instead of the canonical 0xc0 infinity encoding.
        let point =
            BLSPoint { x: BLS12_381_Fq::zero(), y: BLS12_381_Fq::modulus(), is_infinity: true };
        let _ = compress_to_blob_commitment(point);
    }

    #[test(should_fail_with = "Non canonical x coordinate at infinity")]
    fn modulus_x_infinity_point_fails() {
        // Rejected by the infinity validator before `to_be_bytes` gets to range-check x.
        let point =
            BLSPoint { x: BLS12_381_Fq::modulus(), y: BLS12_381_Fq::zero(), is_infinity: true };
        let _ = compress_to_blob_commitment(point);
    }

    // y of -2G plus the BLS12-381 field modulus, as 120-bit limbs. It is congruent to the canonical y
    // but, as an integer, lies in [p, 2^381), so it still fits the limb range checks.
    global NEG_2G_Y_PLUS_MODULUS: [u128; 4] = [
        0x12628959142e3b97777e6868ab82e,
        0x583e6099411cd725ec3fd00214ddf1,
        0x47c73959917339a8f90ef9cb76a634,
        0x1d9786,
    ];

    #[test(should_fail_with = "call to assert_max_bit_size")]
    fn non_canonical_y_on_finite_point_fails() {
        // A finite point whose y is a non-canonical representative passes the on-curve check (it is
        // modular), but compressing it is unsatisfiable: the sort flag needs `-y`, and the modular
        // subtraction cannot produce a valid limb vector from a y that is >= p.
        let canonical = -(BLSPoint::one() + BLSPoint::one());
        let y = BLS12_381_Fq::from_limbs_unsafe(NEG_2G_Y_PLUS_MODULUS);
        assert_eq(y, canonical.y);
        let point = BLSPoint { x: canonical.x, y, is_infinity: false };
        point.validate_on_curve();
        let _ = compress_to_blob_commitment(point);
    }

    #[test]
    fn test_point_compression_greater() {
        // Note that this p is the negation of p from the test test_point_compression_not_greater...
        let p = BLSPoint {
            x: BLS12_381_Fq::from_limbs([
                0x2616100269935afcb1b98c85d5e93e,
                0x96a76064f68c0d4f659f25a046a6d4,
                0x62cc6c3ab4c1ac1abcb9da9677e127,
                0x0f2f5f,
            ]),
            y: BLS12_381_Fq::from_limbs([
                0x3a9f24892593bdff45e837976d7857,
                0x60e8fb551976c560b98e9554ab95ce,
                0x3e3f3b48eae5fb8b8b1efb31c70b9e,
                0x0f0f2d,
            ]),
            is_infinity: false,
        };

        let compressed_point = compress_to_blob_commitment(p).compressed;

        // ...so the compressed point only differs in the first byte, where the is_greater flag is stored.
        let expected_compressed_point_greater = [
            175, 47, 95, 98, 204, 108, 58, 180, 193, 172, 26, 188, 185, 218, 150, 119, 225, 39, 150,
            167, 96, 100, 246, 140, 13, 79, 101, 159, 37, 160, 70, 166, 212, 38, 22, 16, 2, 105,
            147, 90, 252, 177, 185, 140, 133, 213, 233, 62,
        ];
        assert_eq(expected_compressed_point_greater, compressed_point);
    }

    #[test]
    fn test_point_compression_not_greater() {
        // Note that this p is the negation of p from the test test_point_compression_greater...
        let p = BLSPoint {
            x: BLS12_381_Fq::from_limbs([
                0x2616100269935afcb1b98c85d5e93e,
                0x96a76064f68c0d4f659f25a046a6d4,
                0x62cc6c3ab4c1ac1abcb9da9677e127,
                0x0f2f5f,
            ]),
            y: BLS12_381_Fq::from_limbs([
                0x7160da282e6c41bab917c868923254,
                0xea9bf82ff948a1d01912615c4a8e50,
                0xabfa449daf65201c2b24507b1058d8,
                0x0af1e4,
            ]),
            is_infinity: false,
        };

        let compressed_point = compress_to_blob_commitment(p).compressed;

        // ...so the compressed point only differs in the first byte, where the is_greater flag is stored.
        let expected_compressed_point_not_greater = [
            143, 47, 95, 98, 204, 108, 58, 180, 193, 172, 26, 188, 185, 218, 150, 119, 225, 39, 150,
            167, 96, 100, 246, 140, 13, 79, 101, 159, 37, 160, 70, 166, 212, 38, 22, 16, 2, 105,
            147, 90, 252, 177, 185, 140, 133, 213, 233, 62,
        ];
        assert_eq(expected_compressed_point_not_greater, compressed_point);
    }
}
