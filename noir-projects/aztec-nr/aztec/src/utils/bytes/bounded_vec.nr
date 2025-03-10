/// This file is largely a copy of the `array.nr` file, but with the `BoundedVec` type instead of the `[u8; N]` type.
/// Some functions (e.g. get_random_bytes) from `array.nr` are missing though as they were not yet needed and I am not
/// sure if they ever will be. A be_bytes_32_to_fields function was implemented here but is not present in `array.nr`.

/// Converts the input bytes into a BoundedVec of fields. A Field is ~254 bits meaning that each field can store 31
/// whole bytes.
///
/// The input bytes are chunked into chunks of 31 bytes. Each 31-byte chunk is viewed as big-endian, and is converted
/// into a Field. If the last chunk is less than 31 bytes long, then only the relevant bytes are considered.
/// For example, [1, 10, 3] is encoded as [1 * 256^2 + 10 * 256 + 3]
/// Note: ceil(N / 31) = (N + 30) / 31
pub fn be_bytes_31_to_fields<let N: u32>(
    bytes: BoundedVec<u8, N>,
) -> BoundedVec<Field, (N + 30) / 31> {
    let mut fields = BoundedVec::new();

    // There are "bytes.len() / 31" whole fields that can be populated.
    for i in 0..bytes.len() / 31 {
        let mut field = 0;
        for j in 0..31 {
            // Shift the existing value left by 8 bits and add the new byte
            field = field * 256 + bytes.get(i * 31 + j) as Field;
        }
        fields.push(field);
    }

    // Note: if 31 divides bytes.len(), then this loop does not execute.
    // ceil(bytes.len()/31) - floor(bytes.len()/31) = 1, unless 31 divides bytes.len(), in which case it's 0.
    for _ in 0..((bytes.len() + 30) / 31) - (bytes.len() / 31) {
        let mut final_field = 0;
        let final_field_idx = fields.len();
        let final_offset = final_field_idx * 31;
        // bytes.len() - ((bytes.len() / 31) * 31) = bytes.len() - floor(bytes.len()/31) * 31 = the number of bytes
        // to go in the final field.
        for j in 0..bytes.len() - ((bytes.len() / 31) * 31) {
            // Shift the existing value left by 8 bits and add the new byte
            final_field = final_field * 256 + bytes.get(final_offset + j) as Field;
        }

        fields.push(final_field);
    }

    fields
}

/// Converts an input BoundedVec of fields into a BoundedVec of bytes in big-endian order.
///
/// Each input field must contain at most 31 bytes (this is constrained to be so). Note that the last field might
/// contain less than 31 bytes. This is communicated through the M parameter.
///
/// The M parameter is flexible rather than computed from N because this function is commonly used to convert fields
/// back to bytes after a previous bytes->fields conversion. Since the original byte length may not be a multiple
/// of 31, having a flexible M parameter allows us to output the same number of bytes as the original input.
///
/// Each field (other than the last which might be shorter) is converted into 31 big-endian bytes, and the
/// resulting 31-byte chunks are concatenated back together in the order of the original fields. You'll end up
/// with quite a strange ordering of bytes if you use this particular function.
pub fn fields_to_be_bytes_31<let N: u32, let M: u32>(
    fields: BoundedVec<Field, N>,
) -> BoundedVec<u8, M> {
    let mut bytes = BoundedVec::new();

    // Given the input is N fields, and each field (except the last) is mapped to 31 bytes,
    // we check that M > (N - 1) * 31 to cover those first (N - 1) fields.
    std::static_assert(M > (N - 1) * 31, "Not enough output bytes specified");
    // We make this assertion to keep the logic simpler:
    std::static_assert(N * 31 >= M, "Too many output bytes specified.");

    // Since we are dealing with a BoundedVec and not an array, the input might not contain N fields but less. Since
    // the last field can contain less info than 31 bytes if the input is fully populated (due to the flexible M
    // parameter), we need to handle that case separately.
    let input_full = fields.len() == N;

    let num_full_fields = if input_full {
        // Input is full so we need to handle the last field separately.
        fields.len() - 1
    } else {
        // Input is not full so all the fields are expected to contain 31 bytes of information.
        fields.len()
    };

    for i in 0..num_full_fields {
        let field = fields.get(i);

        // We expect that the field contains at most 31 bytes of information.
        field.assert_max_bit_size::<248>();

        // Now we can safely convert the field to 31 bytes.
        let field_as_bytes: [u8; 31] = field.to_be_bytes();

        for j in 0..31 {
            bytes.push(field_as_bytes[j]);
        }
    }

    if (input_full) {
        let final_field = fields.get(fields.len() - 1);

        final_field.assert_max_bit_size::<8 * (M - ((N - 1) * 31))>();

        let final_field_as_bytes: [u8; M - ((N - 1) * 31)] = final_field.to_be_bytes();

        for j in 0..M - ((N - 1) * 31) {
            bytes.push(final_field_as_bytes[j]);
        }
    }

    bytes
}

/// A variant of be_bytes_31_to_fields that handles 32-byte chunks instead of 31-byte chunks. This function
/// is specifically designed for cases where the original data exists as Field elements. Since each Field contains
/// approximately 254 bits of information, 32 bytes are required for complete representation. While the functions above
/// facilitate bytes->fields->bytes conversions, this function is used for bytes->fields transformations.
///
/// Note that this function does not exist in the `array.nr` file. It only exists here because we needed it when
/// processing logs that were decrypted as an array of bytes.
pub fn be_bytes_32_to_fields<let N: u32>(
    bytes: BoundedVec<u8, N>,
) -> BoundedVec<Field, (N + 31) / 32> {
    let mut fields = BoundedVec::new();

    // There are "bytes.len() / 32" whole fields that can be populated.
    for i in 0..bytes.len() / 32 {
        let mut field = 0;
        for j in 0..32 {
            // Shift the existing value left by 8 bits and add the new byte
            field = field * 256 + bytes.get(i * 32 + j) as Field;
        }
        fields.push(field);
    }

    // Note: if 32 divides bytes.len(), then this loop does not execute.
    // ceil(bytes.len()/32) - floor(bytes.len()/32) = 1, unless 32 divides bytes.len(), in which case it's 0.
    for _ in 0..((bytes.len() + 31) / 32) - (bytes.len() / 32) {
        let mut final_field = 0;
        let final_field_idx = fields.len();
        let final_offset = final_field_idx * 32;
        // bytes.len() - ((bytes.len() / 32) * 32) = bytes.len() - floor(bytes.len()/32) * 32 = the number of bytes
        // to go in the final field.
        for j in 0..bytes.len() - ((bytes.len() / 32) * 32) {
            // Shift the existing value left by 8 bits and add the new byte
            final_field = final_field * 256 + bytes.get(final_offset + j) as Field;
        }

        fields.push(final_field);
    }

    fields
}

mod tests_shared_with_array {
    use crate::utils::bytes::bounded_vec::{be_bytes_31_to_fields, fields_to_be_bytes_31};

    #[test]
    fn test_be_bytes_31_to_1_field() {
        let input = BoundedVec::<u8, 31>::from_array([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            25, 26, 27, 28, 29, 30, 31,
        ]);
        let output = be_bytes_31_to_fields(input);

        assert_eq(output.get(0), 0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f);
    }

    #[test]
    fn test_1_field_to_be_bytes_31() {
        let input = BoundedVec::<Field, 1>::from_array([
            0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f,
        ]);
        let output: BoundedVec<u8, 31> = fields_to_be_bytes_31(input);

        let expected = BoundedVec::from_array([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            25, 26, 27, 28, 29, 30, 31,
        ]);

        assert_eq(output, expected);
    }

    #[test]
    fn test_3_small_fields_to_be_bytes_31() {
        let input = BoundedVec::<Field, 3>::from_array([1, 2, 3]);
        let output: BoundedVec<u8, 93> = fields_to_be_bytes_31(input);

        let mut expected = BoundedVec::new();
        // First field - 31 bytes with 1 at end
        for _ in 0..30 {
            expected.push(0);
        }
        expected.push(1);

        // Second field - 31 bytes with 2 at end
        for _ in 0..30 {
            expected.push(0);
        }
        expected.push(2);

        // Third field - 31 bytes with 3 at end
        for _ in 0..30 {
            expected.push(0);
        }
        expected.push(3);

        assert_eq(output, expected);
    }

    #[test]
    fn test_3_small_fields_to_fewer_be_bytes() {
        let input = BoundedVec::<Field, 3>::from_array([1, 2, 3]);
        let output: BoundedVec<u8, 63> = fields_to_be_bytes_31(input);

        let mut expected = BoundedVec::new();
        // First field - 31 bytes with 1 at end
        for _ in 0..30 {
            expected.push(0);
        }
        expected.push(1);

        // Second field - 31 bytes with 2 at end
        for _ in 0..30 {
            expected.push(0);
        }
        expected.push(2);

        // Third field - just 1 byte with value 3
        expected.push(3);

        assert_eq(output, expected);
    }

    #[test]
    fn test_be_bytes_31_to_2_fields() {
        let input = BoundedVec::<u8, 59>::from_array([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46,
            47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59,
        ]);
        let output = be_bytes_31_to_fields(input);

        assert_eq(output.get(0), 0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f);
        assert_eq(output.get(1), 0x202122232425262728292a2b2c2d2e2f303132333435363738393a3b);
    }

    #[test]
    fn test_2_fields_to_be_bytes_31() {
        let input = BoundedVec::<Field, 2>::from_array([
            0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f,
            0x202122232425262728292a2b2c2d2e2f303132333435363738393a3b,
        ]);
        let output: BoundedVec<u8, 62> = fields_to_be_bytes_31(input);

        let mut expected = BoundedVec::new();
        for i in 1..32 {
            expected.push(i as u8);
        }
        for i in 0..3 {
            expected.push(0);
        }
        for i in 32..60 {
            expected.push(i as u8);
        }

        assert_eq(output, expected);
    }

    #[test]
    fn test_large_random_be_bytes_31_input_to_fields_and_back(input: [u8; 128]) {
        let bounded_input = BoundedVec::<u8, 128>::from_array(input);
        let output = be_bytes_31_to_fields(bounded_input);
        let input_back = fields_to_be_bytes_31(output);

        assert_eq(bounded_input, input_back);
    }

    #[test]
    fn test_large_random_input_to_be_bytes_31_and_back(
        input1: [u64; 5],
        input2: [u64; 5],
        input3: [u64; 5],
        input4: [u32; 5],
        input5: [u16; 5],
        input6: [u8; 5],
    ) {
        let mut input = BoundedVec::<Field, 5>::new();
        for i in 0..5 {
            let val = (input1[i] as Field * 2.pow_32(184))
                + (input2[i] as Field * 2.pow_32(120))
                + (input3[i] as Field * 2.pow_32(56))
                + (input4[i] as Field * 2.pow_32(24))
                + (input5[i] as Field * 2.pow_32(8))
                + input6[i] as Field;
            input.push(val);
        }

        let output: BoundedVec<u8, 155> = fields_to_be_bytes_31(input);
        let input_back = be_bytes_31_to_fields(output);

        assert_eq(input, input_back);
    }

    #[test(should_fail_with = "call to assert_max_bit_size")]
    fn test_too_few_destination_be_bytes() {
        let input = BoundedVec::<Field, 2>::from_array([1, 256]);
        let _ignored_result: BoundedVec<u8, 32> = fields_to_be_bytes_31(input);
    }

    #[test(should_fail_with = "call to assert_max_bit_size")]
    fn test_fields_to_be_bytes_31_value_too_large() {
        let input = BoundedVec::<Field, 1>::from_array([2.pow_32(248)]);
        let _ignored_result: BoundedVec<u8, 31> = fields_to_be_bytes_31(input);
    }

    #[test]
    fn test_fields_to_be_bytes_31_max_value() {
        let input = BoundedVec::<Field, 1>::from_array([2.pow_32(248) - 1]);
        let result: BoundedVec<u8, 31> = fields_to_be_bytes_31(input);

        // Check all bytes are max value (255)
        for i in 0..31 {
            assert_eq(result.get(i), 255);
        }
    }
}

mod tests_of_be_bytes_32_to_fields {
    use crate::utils::bytes::bounded_vec::be_bytes_32_to_fields;

    #[test]
    fn test_be_bytes_32_to_1_field() {
        let input = BoundedVec::<u8, 32>::from_array([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            25, 26, 27, 28, 29, 30, 31, 32,
        ]);
        let output = be_bytes_32_to_fields(input);

        assert_eq(
            output.get(0),
            0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20,
        );
    }

    #[test]
    fn test_be_bytes_32_to_2_fields() {
        let input = BoundedVec::<u8, 64>::from_array([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46,
            47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64,
        ]);
        let output = be_bytes_32_to_fields(input);

        assert_eq(
            output.get(0),
            0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20,
        );
        assert_eq(
            output.get(1),
            0x2122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f40,
        );
    }

    #[test]
    fn test_be_bytes_32_to_fields_partial() {
        let input = BoundedVec::<u8, 40>::from_array([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
        ]);
        let output = be_bytes_32_to_fields(input);

        assert_eq(
            output.get(0),
            0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20,
        );
        assert_eq(output.get(1), 0x2122232425262728);
    }

    #[test]
    fn test_be_bytes_32_to_fields_max_value() {
        let mut input = BoundedVec::<u8, 32>::new();
        for _ in 0..32 {
            input.push(255);
        }
        let output = be_bytes_32_to_fields(input);

        assert_eq(output.get(0), 2.pow_32(256) - 1);
    }
}

mod bounded_vec_specific {
    use crate::utils::bytes::bounded_vec::{be_bytes_31_to_fields, fields_to_be_bytes_31};

    #[test]
    fn test_be_bytes_31_to_1_field_input_not_full() {
        // This test is like test_be_bytes_31_to_1_field, but the input is not fully populated (last byte is missing).
        let input = BoundedVec::<u8, 31>::from_array([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            25, 26, 27, 28, 29, 30, // 31,
        ]);
        let output = be_bytes_31_to_fields(input);

        assert_eq(output.get(0), 0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e);
    }

    #[test]
    fn test_2_fields_to_be_bytes_31_input_not_full() {
        // In this test we check the case where the input BoundedVec is not fully populated (input.len() < N,
        // max length is 3 but we pass in only 2 fields).
        let input = BoundedVec::<Field, 3>::from_array([
            0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f,
            0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f,
        ]);
        // 63 is the minimum output length when the input max length is 3 because in the case where the input is fully
        // populated, the first 2 fields would contain 62 bytes of information and the last field would have to contain
        // at least 1 byte.
        let output: BoundedVec<u8, 63> = fields_to_be_bytes_31(input);

        let expected = BoundedVec::from_array([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            25, 26, 27, 28, 29, 30, 31, //first field
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            25, 26, 27, 28, 29, 30, 31, //second field
        ]);

        assert_eq(output, expected);
    }

    #[test]
    fn test_be_bytes_31_to_fields_long_input() {
        let input = BoundedVec::<u8, 447>::from_array([
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 26, 89, 20, 23, 177, 69, 135, 166, 49, 232, 132, 64, 213, 124, 163, 163,
            60, 177, 225, 155, 177, 198, 199, 238, 55, 179, 21, 230, 93, 167, 255, 44, 29, 203, 50,
            194, 89, 128, 138, 118, 126, 165, 9, 35, 233, 172, 11, 245, 27, 197, 132, 122, 240, 135,
            241, 5, 52, 5, 102, 242, 37, 97, 64, 138, 26, 246, 63, 45, 34, 250, 76, 186, 113, 179,
            213, 136, 155, 78, 173, 10, 43, 221, 3, 78, 143, 15, 141, 59, 223, 114, 121, 140, 243,
            218, 18, 140,
        ]);

        let output = be_bytes_31_to_fields(input);

        std::println(output);
    }
}
