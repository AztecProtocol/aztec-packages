// These functions are used to facilitate the conversion of log plaintext represented as fields into bytes and back.
//
// `fields_to_bytes` uses fixed-size arrays since encryption contexts have compile-time size information.
// `fields_from_bytes` uses BoundedVec for flexibility in unconstrained contexts where sizes are dynamic.
//
// Together they provide bidirectional conversion between fields and bytes.

/// Converts an input array of fields into a single array of bytes. Use `fields_from_bytes` to obtain the original
/// field array.
/// Each field is converted to a 32-byte big-endian array.
/// Since a field is ~254 bits, you'll end up with a subtle 2-bit "gap" at the big end,
/// every 32 bytes. Be careful that such a gap doesn't leak information!
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
/// Note: N must be a multiple of 32 bytes
pub fn fields_from_bytes<let N: u32>(bytes: BoundedVec<u8, N>) -> BoundedVec<Field, N / 32> {
    // Assert that input length is a multiple of 32
    assert(bytes.len() % 32 == 0, "Input length must be a multiple of 32");

    // Since fields are ~254 bits, we must ensure the most significant byte of each 32-byte chunk
    // contains no more than 6 bits, preventing overflow when converting back to fields.
    for i in 0..bytes.len() / 32 {
        let last_byte = bytes.get(i * 32 + 31) as Field;
        last_byte.assert_max_bit_size::<6>();
    }

    let mut fields = BoundedVec::new();

    // Since input length is a multiple of 32, we can simply process all chunks fully
    for i in 0..bytes.len() / 32 {
        let mut field = 0;
        for j in 0..32 {
            // Shift the existing value left by 8 bits and add the new byte
            field = field * 256 + bytes.get(i * 32 + j) as Field;
        }
        fields.push(field);
    }

    fields
}

mod tests {
    use super::{fields_from_bytes, fields_to_bytes};

    #[test]
    fn test_random_fields_to_bytes_and_back(input: [Field; 3]) {
        // Convert to bytes
        let bytes = fields_to_bytes(input);

        // At this point in production, the log flies through the system and we get a BoundedVec on the other end.
        // So we need to convert the field array to a BoundedVec to be able to feed it to the `fields_from_bytes`
        // function.
        // 113 is an arbitrary max length that is larger than the input length of 96.
        let bytes_as_bounded_vec = BoundedVec::<_, 113>::from_array(bytes);

        // Convert back to fields
        let fields_back = fields_from_bytes(bytes_as_bounded_vec);

        // We also convert the input to a BoundedVec to be able to compare.
        let input_as_bounded_vec = BoundedVec::<_, 3>::from_array(input);

        // Compare the original input with the round-tripped result
        assert_eq(input_as_bounded_vec, fields_back);
    }

    #[test(should_fail_with = "Input length must be a multiple of 32")]
    fn test_to_fields_assert() {
        // 143 is an arbitrary max length that is larger than 33
        let input = BoundedVec::<_, 143>::from_array([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            25, 26, 27, 28, 29, 30, 31, 32, 33,
        ]);

        // This should fail since 33 is not a multiple of 32
        let _fields = fields_from_bytes(input);
    }

    #[test(should_fail_with = "call to assert_max_bit_size")]
    fn test_fields_from_bytes_overflow() {
        // Create input with last byte > 63 (6 bits)
        // 64 is an arbitrary max length that is larger than 32
        let input = BoundedVec::<_, 64>::from_array([
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 64, // 64 = 0b1000000 (7 bits)
        ]);

        // This should fail since the last byte is 64 which requires 7 bits
        let _fields = fields_from_bytes(input);
    }

}
