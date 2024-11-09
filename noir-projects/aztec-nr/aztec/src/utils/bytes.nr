// Converts the input bytes into an array of fields. A Field is ~254 bits meaning that each field can store 31 bytes.
//
// Each 31 byte chunk is converted into a Field as if the chunk was the Field's big endian representation. If the last chunk
// is less than 31 bytes long, then only the relevant bytes are conisdered.
// For example, [1, 10, 3] is encoded as [1 * 256^2 + 10 * 256 + 3]
pub fn bytes_to_fields<let N: u32>(input: [u8; N]) -> [Field; (N + 30) / 31] {
    let mut dst = [0; (N + 30) / 31];

    for dst_index in 0..((N + 30) / 31) {
        let mut field_value = 0;

        for i in 0..31 {
            let byte_index = dst_index * 31 + i;
            if byte_index < N {
                // Shift the existing value left by 8 bits and add the new byte
                field_value = field_value * 256 + input[byte_index] as Field;
            }
        }

        dst[dst_index] = field_value;
    }

    dst
}

// Converts an input array of fields into bytes. Each field of input has to contain only 31 bytes.
// TODO(#8618): Optimize for public use.
pub fn fields_to_bytes<let N: u32, let M: u32>(input: [Field; M]) -> [u8; N] {
    let mut dst = [0; N];

    for src_index in 0..M {
        let field = input[src_index];

        // We expect that the field contains at most 31 bytes of information.
        field.assert_max_bit_size::<248>();

        // Now we can safely convert the field to 31 bytes.
        let src: [u8; 31] = field.to_be_bytes();

        // Since some of the bytes might not be occupied (if the source value requiring less than 31 bytes),
        // we have to compute the start index from which to copy.
        let remaining_bytes = N - src_index * 31;
        let src_start_index = if remaining_bytes < 31 {
            // If the remaining bytes are less than 31, we only copy the remaining bytes
            31 - remaining_bytes
        } else {
            0
        };

        // Note: I tried combining this check with `assert_max_bit_size` above but `assert_max_bit_size` expects
        // the argument to be a constant. Using comptime block to derive the number of bits also does not work
        // because comptime is evaluated before generics.
        for i in 0..src_start_index {
            assert(src[i] == 0, "Field does not fit into remaining bytes");
        }

        for i in 0..31 {
            let byte_index = src_index * 31 + i;
            if byte_index < N {
                dst[byte_index] = src[src_start_index + i];
            }
        }
    }

    dst
}

mod test {
    use crate::utils::bytes::{bytes_to_fields, fields_to_bytes};

    #[test]
    fn test_bytes_to_1_field() {
        let input = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            25, 26, 27, 28, 29, 30, 31,
        ];
        let output = bytes_to_fields(input);

        assert_eq(output[0], 0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f);
    }

    #[test]
    fn test_1_field_to_bytes() {
        let input = [0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f];
        let output: [u8; 31] = fields_to_bytes(input);

        assert_eq(
            output,
            [
                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
                24, 25, 26, 27, 28, 29, 30, 31,
            ],
        );
    }

    #[test]
    fn test_3_small_fields_to_bytes() {
        let input = [1, 2, 3];
        let output: [u8; 93] = fields_to_bytes(input);

        // Each field should occupy 31 bytes with the non-zero value being placed in the last one.
        assert_eq(
            output,
            [
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 3,
            ],
        );
    }

    #[test]
    fn test_3_small_fields_to_less_bytes() {
        let input = [1, 2, 3];
        let output: [u8; 63] = fields_to_bytes(input);

        // First 2 fields should occupy 31 bytes with the non-zero value being placed in the last one while the last
        // field should occupy 1 byte. There is not information destruction here because the last field fits into
        // 1 byte.
        assert_eq(
            output,
            [
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 2, 3,
            ],
        );
    }

    #[test]
    fn test_bytes_to_2_fields() {
        let input = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46,
            47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59,
        ];
        let output = bytes_to_fields(input);

        assert_eq(output[0], 0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f);
        assert_eq(output[1], 0x202122232425262728292a2b2c2d2e2f303132333435363738393a3b);
    }

    #[test]
    fn test_2_fields_to_bytes() {
        let input = [
            0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f,
            0x202122232425262728292a2b2c2d2e2f303132333435363738393a3b,
        ];
        let output: [u8; 62] = fields_to_bytes(input);

        assert_eq(
            output,
            [
                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
                24, 25, 26, 27, 28, 29, 30, 31, 0, 0, 0, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42,
                43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59,
            ],
        );
    }

    #[test]
    fn test_large_random_input_to_fields_and_back(input: [u8; 128]) {
        let output = bytes_to_fields(input);
        let input_back: [u8; 128] = fields_to_bytes(output);

        assert_eq(input, input_back);
    }

    // I need to get an array of random values lower than 2^248 on input and since there is no u248 type and modulo
    // operation is not supported on a Field (to do field % 2^248), I will take multiple smaller values and combine
    // them to get a value lower than 2^248.
    #[test]
    fn test_large_random_input_to_bytes_and_back(
        input1: [u64; 5],
        input2: [u64; 5],
        input3: [u64; 5],
        input4: [u32; 5],
        input5: [u16; 5],
        input6: [u8; 5],
    ) {
        let mut input = [0; 5];
        for i in 0..5 {
            input[i] = (input1[i] as Field * 2.pow_32(184))
                + (input2[i] as Field * 2.pow_32(120))
                + (input3[i] as Field * 2.pow_32(56))
                + (input4[i] as Field * 2.pow_32(24))
                + (input5[i] as Field * 2.pow_32(8))
                + input6[i] as Field;
        }

        let output: [u8; 155] = fields_to_bytes(input);
        let input_back = bytes_to_fields(output);

        assert_eq(input, input_back);
    }

    #[test(should_fail_with = "Field does not fit into remaining bytes")]
    fn test_too_few_destination_bytes() {
        // We should get an error here because first field gets converted to 31 bytes and the second field needs
        // at least 2 bytes but we provide it with 1.
        let input = [1, 256];
        let _ignored_result: [u8; 32] = fields_to_bytes(input);
    }

    #[test(should_fail_with = "call to assert_max_bit_size")]
    fn test_fields_to_bytes_value_too_large() {
        let input = [2.pow_32(248)];
        let _ignored_result: [u8; 31] = fields_to_bytes(input);
    }

    #[test]
    fn test_fields_to_bytes_max_value() {
        let input = [2.pow_32(248) - 1];
        let result: [u8; 31] = fields_to_bytes(input);

        // We check that all the bytes were set to max value (255)
        for i in 0..31 {
            assert_eq(result[i], 255);
        }
    }
}
