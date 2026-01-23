// These functions are used to facilitate the conversion of log plaintext represented as fields into bytes and back.
//
// `fields_to_bytes` uses fixed-size arrays since encryption contexts have compile-time size information.
// `fields_from_bytes` uses BoundedVec for flexibility in unconstrained contexts where sizes are dynamic.
//
// Together they provide bidirectional conversion between fields and bytes.

/// Converts an input array of fields into a single array of bytes. Use `fields_from_bytes` to obtain the original
/// field array.
/// Each field is converted to a 32-byte big-endian array.
///
/// For example, if you have a field array [123, 456], it will be converted to a 64-byte array:
/// [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,123,  // First field (32 bytes)
///  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,200]  // Second field (32 bytes)
///
/// Since a field is ~254 bits, you'll end up with a subtle 2-bit "gap" at the big end, every 32 bytes. Be careful
/// that such a gap doesn't leak information! This could happen if you for example expected the output to be
/// indistinguishable from random bytes.
pub fn fields_to_bytes<let N: u32>(fields: [Field; N]) -> [u8; 32 * N] {
    let mut bytes = [0; 32 * N];

    for i in 0..N {
        let field_as_bytes: [u8; 32] = fields[i].to_be_bytes();

        for j in 0..32 {
            bytes[i * 32 + j] = field_as_bytes[j];
        }
    }

    bytes
}

/// Converts an input BoundedVec of bytes into a BoundedVec of fields. Arbitrary byte arrays are not allowed: this
/// is assumed to be an array obtained via `fields_to_bytes`, i.e. one that actually represents fields. To convert
/// a byte array into Fields, use `bytes_to_fields`.
///
/// The input bytes are chunked into chunks of 32 bytes. Each 32-byte chunk is viewed as big-endian, and is converted
/// into a Field.
/// For example, [1, 10, 3, ..., 0] (32 bytes) is encoded as [1 * 256^31 + 10 * 256^30 + 3 * 256^29 + ... + 0]
/// Note 1: N must be a multiple of 32 bytes
/// Note 2: The max value check code was taken from std::field::to_be_bytes function.
pub fn fields_from_bytes<let N: u32>(bytes: BoundedVec<u8, N>) -> BoundedVec<Field, N / 32> {
    // Assert that input length is a multiple of 32
    assert(bytes.len() % 32 == 0, "Input length must be a multiple of 32");

    let mut fields = BoundedVec::new();

    let p = std::field::modulus_be_bytes();

    // Since input length is a multiple of 32, we can simply process all chunks fully
    for i in 0..bytes.len() / 32 {
        let mut field = 0;

        // Process each byte in the 32-byte chunk
        let mut ok = false;

        for j in 0..32 {
            let next_byte = bytes.get(i * 32 + j);
            field = field * 256 + next_byte as Field;

            if !ok {
                if next_byte != p[j] {
                    assert(next_byte < p[j], "Value does not fit in field");
                    ok = true;
                }
            }
        }
        assert(ok, "Value does not fit in field");

        fields.push(field);
    }

    fields
}

mod tests {
    use crate::utils::array::subarray;
    use super::{fields_from_bytes, fields_to_bytes};

    #[test]
    unconstrained fn random_fields_to_bytes_and_back(input: [Field; 3]) {
        // Convert to bytes
        let bytes = fields_to_bytes(input);

        // At this point in production, the log flies through the system and we get a BoundedVec on the other end.
        // So we need to convert the field array to a BoundedVec to be able to feed it to the `fields_from_bytes`
        // function.
        // 113 is an arbitrary max length that is larger than the input length of 96.
        let bytes_as_bounded_vec = BoundedVec::<_, 113>::from_array(bytes);

        // Convert back to fields
        let fields_back = fields_from_bytes(bytes_as_bounded_vec);

        // Compare the original input with the round-tripped result
        assert_eq(fields_back.len(), input.len());
        assert_eq(subarray(fields_back.storage(), 0), input);
    }

    #[test(should_fail_with = "Input length must be a multiple of 32")]
    unconstrained fn to_fields_assert() {
        // 143 is an arbitrary max length that is larger than 33
        let input = BoundedVec::<_, 143>::from_array([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            25, 26, 27, 28, 29, 30, 31, 32, 33,
        ]);

        // This should fail since 33 is not a multiple of 32
        let _fields = fields_from_bytes(input);
    }

    #[test]
    unconstrained fn fields_from_bytes_max_value() {
        let max_field_as_bytes: [u8; 32] = (-1).to_be_bytes();
        let input = BoundedVec::<_, 32>::from_array(max_field_as_bytes);

        let fields = fields_from_bytes(input);

        // The result should be a largest value storable in a field (-1 since we are modulo-ing)
        assert_eq(fields.get(0), -1);
    }

    // In this test we verify that overflow check works by taking the max allowed value, bumping a random byte
    // and then feeding it to `fields_from_bytes` as input.
    #[test(should_fail_with = "Value does not fit in field")]
    unconstrained fn fields_from_bytes_overflow(random_value: u8) {
        let index_of_byte_to_bump = random_value % 32;

        // Obtain the byte representation of the maximum field value
        let max_field_value_as_bytes: [u8; 32] = (-1).to_be_bytes();

        let byte_to_bump = max_field_value_as_bytes[index_of_byte_to_bump as u32];

        // Skip test execution if the selected byte is already at maximum value (255).
        // This is acceptable since we are using fuzz testing to generate many test cases.
        if byte_to_bump != 255 {
            let mut input = BoundedVec::<_, 32>::from_array(max_field_value_as_bytes);

            // Increment the selected byte to exceed the field's maximum value
            input.set(index_of_byte_to_bump as u32, byte_to_bump + 1);

            // Attempt the conversion, which should fail due to the value exceeding the field's capacity
            let _fields = fields_from_bytes(input);
        }
    }

}
