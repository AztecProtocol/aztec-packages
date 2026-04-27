/// Encodes an array of fields as bytes.
///
/// Losslessly preserves any field value; use
/// [`try_decode_fields_from_bytes`](crate::utils::conversion::fields_as_bytes::try_decode_fields_from_bytes) to
/// recover the original fields.
///
/// ## Encoding
///
/// Each field is written as 32 big-endian bytes and the chunks are concatenated. The field array `[5, 42]` becomes:
///
/// ```text
/// [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,  // First field (32 bytes)
///  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,42] // Second field (32 bytes)
/// ```
///
/// ## Privacy
///
/// The BN254 modulus is `< 2^254`, so every 32-byte chunk has its top bit at zero and the next bit biased. The output
/// is therefore distinguishable from uniform random bytes; take this into account when feeding it into anything that
/// assumes uniform randomness (e.g. ciphertexts meant to look random).
pub fn encode_fields_as_bytes<let N: u32>(fields: [Field; N]) -> [u8; 32 * N] {
    let mut bytes = [0; 32 * N];
    for i in 0..N {
        let chunk: [u8; 32] = fields[i].to_be_bytes();
        for j in 0..32 {
            bytes[i * 32 + j] = chunk[j];
        }
    }
    bytes
}

/// Decodes bytes back into fields.
///
/// Panics if the input length is not a multiple of 32 or if any chunk exceeds the BN254 field modulus. See
/// [`try_decode_fields_from_bytes`](crate::utils::conversion::fields_as_bytes::try_decode_fields_from_bytes)
/// for a non-panicking variant.
pub fn decode_fields_from_bytes<let N: u32>(bytes: BoundedVec<u8, N>) -> BoundedVec<Field, N / 32> {
    assert(bytes.len() % 32 == 0, "Input length must be a multiple of 32");
    try_decode_fields_from_bytes(bytes).expect(f"Value does not fit in field")
}

/// Decodes bytes back into fields, returning None on failure.
///
/// Inverse of
/// [`encode_fields_as_bytes`](crate::utils::conversion::fields_as_bytes::encode_fields_as_bytes).
/// Returns `Option::none()` if the input length is not a multiple of 32, or if any 32-byte chunk is `>=` the BN254
/// field modulus.
pub fn try_decode_fields_from_bytes<let N: u32>(bytes: BoundedVec<u8, N>) -> Option<BoundedVec<Field, N / 32>> {
    if bytes.len() % 32 == 0 {
        let num_chunks = bytes.len() / 32;
        let mut fields: BoundedVec<Field, N / 32> = BoundedVec::new();
        for i in 0..num_chunks {
            let maybe_field = try_decode_field_from_bytes(bytes, i * 32);
            if maybe_field.is_some() {
                fields.push(maybe_field.unwrap());
            }
        }
        if fields.len() == num_chunks {
            Option::some(fields)
        } else {
            Option::none()
        }
    } else {
        Option::none()
    }
}

fn try_decode_field_from_bytes<let N: u32>(bytes: BoundedVec<u8, N>, offset: u32) -> Option<Field> {
    // Field arithmetic silently wraps values >= the modulus, so we compare each chunk against the modulus
    // byte-by-byte (big-endian) while building `field`. cmp: 0 = equal so far, 1 = less than modulus, 2 = exceeds.
    let p = std::field::modulus_be_bytes();
    let mut field = 0;
    let mut cmp: u8 = 0;
    for j in 0..32 {
        let byte = bytes.get(offset + j);
        field = field * 256 + byte as Field;
        if cmp == 0 {
            if byte < p[j] {
                cmp = 1;
            } else if byte > p[j] {
                cmp = 2;
            }
        }
    }

    if cmp == 1 {
        Option::some(field)
    } else {
        Option::none()
    }
}

mod tests {
    use crate::utils::array::subarray;
    use super::{decode_fields_from_bytes, encode_fields_as_bytes, try_decode_fields_from_bytes};

    #[test]
    unconstrained fn round_trips_fields(input: [Field; 3]) {
        let bytes = encode_fields_as_bytes(input);

        // In production the bytes fly through the system and arrive as a BoundedVec on the other end. 113 is an
        // arbitrary max length larger than the input length of 96.
        let bytes_bvec = BoundedVec::<_, 113>::from_array(bytes);
        let fields_back = try_decode_fields_from_bytes(bytes_bvec).unwrap();

        assert_eq(fields_back.len(), input.len());
        assert_eq(subarray(fields_back.storage(), 0), input);
    }

    #[test]
    unconstrained fn try_decode_returns_none_on_length_not_multiple_of_32() {
        let input = BoundedVec::<_, 64>::from_parts([0 as u8; 64], 33);
        assert(try_decode_fields_from_bytes(input).is_none());
    }

    #[test]
    unconstrained fn try_decode_accepts_max_field() {
        // -1 in field arithmetic wraps to `modulus - 1`, the largest valid field value.
        let max_field_as_bytes: [u8; 32] = (-1).to_be_bytes();
        let input = BoundedVec::<_, 32>::from_array(max_field_as_bytes);

        let fields = try_decode_fields_from_bytes(input).unwrap();

        assert_eq(fields.get(0), -1);
    }

    // Verifies the overflow check: take the max allowed value, bump a random byte, feed it in.
    #[test]
    unconstrained fn try_decode_returns_none_on_chunk_above_modulus(random_value: u8) {
        let index_of_byte_to_bump = random_value % 32;
        let max_field_value_as_bytes: [u8; 32] = (-1).to_be_bytes();
        let byte_to_bump = max_field_value_as_bytes[index_of_byte_to_bump as u32];

        // Skip if the selected byte is already 255. Acceptable under fuzz testing.
        if byte_to_bump != 255 {
            let mut input = BoundedVec::<_, 32>::from_array(max_field_value_as_bytes);
            input.set(index_of_byte_to_bump as u32, byte_to_bump + 1);

            assert(try_decode_fields_from_bytes(input).is_none());
        }
    }

    #[test]
    unconstrained fn try_decode_returns_none_on_chunk_equal_to_modulus() {
        // The field modulus itself is not a valid field value (it wraps to 0).
        let p: [u8; 32] = std::field::modulus_be_bytes().as_array();
        let input = BoundedVec::<u8, 32>::from_array(p);
        assert(try_decode_fields_from_bytes(input).is_none());
    }

    #[test(should_fail_with = "Input length must be a multiple of 32")]
    unconstrained fn decode_asserts_length_multiple_of_32() {
        let input = BoundedVec::<_, 143>::from_array([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
            30, 31, 32, 33,
        ]);
        let _fields = decode_fields_from_bytes(input);
    }

    #[test(should_fail_with = "Value does not fit in field")]
    unconstrained fn decode_panics_on_chunk_above_modulus(random_value: u8) {
        let index_of_byte_to_bump = random_value % 32;
        let max_field_value_as_bytes: [u8; 32] = (-1).to_be_bytes();
        let byte_to_bump = max_field_value_as_bytes[index_of_byte_to_bump as u32];

        if byte_to_bump != 255 {
            let mut input = BoundedVec::<_, 32>::from_array(max_field_value_as_bytes);
            input.set(index_of_byte_to_bump as u32, byte_to_bump + 1);
            let _fields = decode_fields_from_bytes(input);
        }
    }
}
