use crate::utils::compress_to_blob_commitment;
use super::BLSPoint;
use bigcurve::BigCurve;
use bignum::{BigNum, BLS12_381_Fq};
use types::{
    constants::BLS12_POINT_COMPRESSED_BYTES,
    traits::Empty,
    utils::{arrays::subarray, field::field_from_bytes},
};

pub struct BatchingBlobCommitment {
    pub point: BLSPoint,
    pub compressed: [u8; BLS12_POINT_COMPRESSED_BYTES],
}

impl BatchingBlobCommitment {
    // The compressed form is a BLS12Fq field encoded as 2 BN254Fr fields.
    // The first is the first 31 bytes, and the second is the next 17 bytes:
    pub fn to_compressed_fields(self) -> [Field; 2] {
        [
            // field 0 is bytes 0..31
            field_from_bytes::<31>(subarray(self.compressed, 0), true),
            // field 1 is bytes 31..48
            field_from_bytes::<17>(subarray(self.compressed, 31), true),
        ]
    }

    // Helper fn largely used in testing to simplify fixtures
    pub fn from_limbs(x_limbs: [u128; 4], y_limbs: [u128; 4]) -> Self {
        let x = BLS12_381_Fq::from_limbs(x_limbs);
        let y = BLS12_381_Fq::from_limbs(y_limbs);
        let point = BLSPoint { x, y, is_infinity: (x.is_zero()) & (y.is_zero()) };
        compress_to_blob_commitment(point)
    }
}

impl Eq for BatchingBlobCommitment {
    fn eq(self, other: Self) -> bool {
        (self.point.eq(other.point)) & (self.compressed.eq(other.compressed))
    }
}

impl Empty for BatchingBlobCommitment {
    fn empty() -> Self {
        Self { point: BLSPoint::point_at_infinity(), compressed: [0; BLS12_POINT_COMPRESSED_BYTES] }
    }
}
