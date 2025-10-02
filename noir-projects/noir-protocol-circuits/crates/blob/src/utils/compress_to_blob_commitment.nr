use crate::abis::{batching_blob_commitment::BatchingBlobCommitment, BLSPoint};
use bignum::{BigNum, BLS12_381_Fq};
use types::utils::field::byte_to_bits_be;

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
    let (flags, x) = get_flags(point);
    let mut compressed = x.to_be_bytes();
    let most_sig_bits = byte_to_bits_be(compressed[0]);
    for i in 0..3 {
        assert_eq(most_sig_bits[i], 0, "Invalid BLS12-381 x coordinate given to compress().");
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

    #[test]
    unconstrained fn point_compression() {
        let point = BLSPoint::offset_generator();
        let (flags, x) = get_flags(point);
        // is_compressed = true
        assert_eq(flags[0], true);
        // is_infinity = false
        assert_eq(flags[1], false);
        // is_greater = false (point.y < -point.y for G)
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
            reconstructed_x.__pow(BLS12_381_Fq::from(3)).add(a.mul(reconstructed_x)).add(b);
        let mut reconstructed_y = reconstructed_y_squared.__tonelli_shanks_sqrt().unwrap();
        // If the sqrt returned is the 'greater' one, negate it (since here is_greater = false):
        reconstructed_y = if reconstructed_y > -reconstructed_y {
            -reconstructed_y
        } else {
            reconstructed_y
        };
        assert_eq(reconstructed_y, point.y);
    }

    #[test]
    unconstrained fn test_point_compression_greater() {
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
    unconstrained fn test_point_compression_not_greater() {
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
