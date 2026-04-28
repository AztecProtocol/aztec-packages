use std::static_assert;

/// Encodes an array of bytes as fields.
///
/// Use
/// [`decode_bytes_from_fields`](crate::utils::conversion::bytes_as_fields::decode_bytes_from_fields) to recover
/// the original bytes.
///
/// The `bytes` array length must be a multiple of 31. If padding is added, it will need to be manually removed
/// after decoding.
///
/// ## Encoding
///
/// Each 31-byte chunk is interpreted as a big-endian integer and stored in a `Field`. For input `[1, 10, 3, ..., 0]`
/// (31 bytes), the resulting `Field` is `1 * 256^30 + 10 * 256^29 + 3 * 256^28 + ... + 0`.
pub fn encode_bytes_as_fields<let N: u32>(bytes: [u8; N]) -> [Field; N / 31] {
    static_assert(N % 31 == 0, "N must be a multiple of 31");

    let mut fields = [0; N / 31];
    for i in 0..N / 31 {
        let mut field = 0;
        for j in 0..31 {
            field = field * 256 + bytes[i * 31 + j] as Field;
        }
        fields[i] = field;
    }

    fields
}

/// Decodes fields back into bytes.
///
/// Inverse of
/// [`encode_bytes_as_fields`](crate::utils::conversion::bytes_as_fields::encode_bytes_as_fields).
/// Each input `Field` must fit in 248 bits; `Field::to_be_bytes::<31>()` fails the proof otherwise.
pub fn decode_bytes_from_fields<let N: u32>(fields: BoundedVec<Field, N>) -> BoundedVec<u8, N * 31> {
    let mut bytes = BoundedVec::new();
    for i in 0..fields.len() {
        let chunk: [u8; 31] = fields.get(i).to_be_bytes();
        for j in 0..31 {
            bytes.push(chunk[j]);
        }
    }
    bytes
}

mod tests {
    use crate::utils::array::subarray;
    use super::{decode_bytes_from_fields, encode_bytes_as_fields};

    #[test]
    unconstrained fn round_trips_bytes(input: [u8; 93]) {
        let fields = encode_bytes_as_fields(input);

        // In production the fields fly through the system and arrive as a BoundedVec on the other end.
        let fields_bvec = BoundedVec::<_, 6>::from_array(fields);
        let bytes_back = decode_bytes_from_fields(fields_bvec);

        assert_eq(bytes_back.len(), input.len());
        assert_eq(subarray(bytes_back.storage(), 0), input);
    }

    #[test(should_fail_with = "N must be a multiple of 31")]
    unconstrained fn encode_rejects_length_not_multiple_of_31() {
        let _fields = encode_bytes_as_fields([0; 32]);
    }

    #[test(should_fail_with = "Field failed to decompose into specified 31 limbs")]
    unconstrained fn decode_rejects_oversized_field() {
        // `Field::to_be_bytes::<31>()` fails the proof when a field has any bit above position 247 set.
        let oversized: Field = (1 as Field) * 2.pow_32(249);
        let input = BoundedVec::<_, 1>::from_array([oversized]);
        let _bytes = decode_bytes_from_fields(input);
    }
}
