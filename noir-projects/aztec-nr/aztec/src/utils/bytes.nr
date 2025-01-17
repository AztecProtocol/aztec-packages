use crate::oracle::random::random;

// Converts the input bytes into an array of fields. A Field is ~254 bits meaning that each field can store 31 whole bytes.
//
// The input bytes are chunked into chunks of 31 bytes. Each 31-byte chunk is viewed as big-endian, and is converted into a Field. If the last chunk
// is less than 31 bytes long, then only the relevant bytes are considered.
// For example, [1, 10, 3] is encoded as [1 * 256^2 + 10 * 256 + 3]
// Note: ceil(N / 31) = (N + 30) / 31
pub fn be_bytes_31_to_fields<let N: u32>(bytes: [u8; N]) -> [Field; (N + 30) / 31] {
    let mut fields = [0; (N + 30) / 31];

    // There are N / 31 whole fields that can be populated.
    for i in 0..N / 31 {
        let mut field = 0;
        for j in 0..31 {
            // Shift the existing value left by 8 bits and add the new byte
            field = field * 256 + bytes[i * 31 + j] as Field;
        }
        fields[i] = field;
    }

    // Note: if 31 divides N, then this loop does not execute.
    // ceil(N/31) - floor(N/31) = 1, unless 31 divides N, in which case it's 0.
    for _ in 0..((N + 30) / 31) - (N / 31) {
        let mut final_field = 0;
        let final_field_idx = fields.len() - 1;
        let final_offset = final_field_idx * 31;
        // N - ((N / 31) * 31) = N - floor(N/31) * 31 = the number of bytes to go in the final field.
        for j in 0..N - ((N / 31) * 31) {
            // Shift the existing value left by 8 bits and add the new byte
            final_field = final_field * 256 + bytes[final_offset + j] as Field;
        }
        dep::protocol_types::debug_log::debug_log_format(
            "pushing final field in be_bytes_31_to_fields: {0}",
            [final_field],
        );

        fields[final_field_idx] = final_field;
    }

    fields
}

pub fn le_bytes_31_to_fields<let N: u32>(bytes: [u8; N]) -> [Field; (N + 30) / 31] {
    let mut fields = [0; (N + 30) / 31];

    // There are N / 31 whole fields that can be populated.
    for i in 0..N / 31 {
        let mut field = 0;
        for j in 0..31 {
            let k = 31 - j - 1; // iterate in reverse.
            // Shift the existing value left by 8 bits and add the new byte
            field = field * 256 + bytes[i * 31 + k] as Field;
        }
        fields[i] = field;
    }

    // Note: if 31 divides N, then this loop does not execute.
    // ceil(N/31) - floor(N/31) = 1, unless 31 divides N, in which case it's 0.
    for _ in 0..((N + 30) / 31) - (N / 31) {
        let mut final_field = 0;
        let final_field_idx = fields.len() - 1;
        let final_offset = final_field_idx * 31;
        // N - ((N / 31) * 31) = N - floor(N/31) * 31 = the number of bytes to go in the final field.
        for j in 0..N - ((N / 31) * 31) {
            let k = (N - ((N / 31) * 31)) - j - 1; // iterate in reverse.
            // Shift the existing value left by 8 bits and add the new byte
            final_field = final_field * 256 + bytes[final_offset + k] as Field;
        }
        fields[final_field_idx] = final_field;
    }

    fields
}

// Converts an input array of fields into bytes. Each field of input has to contain only 31 bytes.
// It appears that the original author of this function wants to give the caller some control
// over the number of bytes that are returned: the final field can be mapped to fewer than 31 bytes, it seems,
// based on the caller's choice of M.
// Given the input is N fields, and each field (except apparently the last) is mapped to 31 bytes,
// we definitely need M > (N - 1) * 31 to cover those first (N - 1) fields. Hence the static assertion.
// TODO: this is the same as the "le" version of this function, save for the `field.to_be_bytes()` calls. I tried passing the conversion function in as a parameter, to reduce code duplication, but couldn't get it to work.
pub fn fields_to_be_bytes_31<let N: u32, let M: u32>(fields: [Field; N]) -> [u8; M] {
    let mut bytes = [0; M];

    std::static_assert(M > (N - 1) * 31, "Not enough output bytes specified");
    // We make this assertion to keep the logic simpler:
    std::static_assert(N * 31 >= M, "Too many output bytes specified.");

    for i in 0..N - 1 {
        let field = fields[i];

        // We expect that the field contains at most 31 bytes of information.
        field.assert_max_bit_size::<248>();

        // Now we can safely convert the field to 31 bytes.
        let field_as_bytes: [u8; 31] = field.to_be_bytes();

        for j in 0..31 {
            bytes[i * 31 + j] = field_as_bytes[j];
        }
    }

    // The final field will be
    let final_field = fields[N - 1];
    final_field.assert_max_bit_size::<8 * (M - ((N - 1) * 31))>();

    let final_field_as_bytes: [u8; M - ((N - 1) * 31)] = final_field.to_be_bytes();

    let start_index = (N - 1) * 31;
    for j in 0..M - ((N - 1) * 31) {
        bytes[start_index + j] = final_field_as_bytes[j];
    }

    bytes
}

pub fn fields_to_le_bytes_31<let N: u32, let M: u32>(fields: [Field; N]) -> [u8; M] {
    let mut bytes = [0; M];

    std::static_assert(M > (N - 1) * 31, "Not enough output bytes specified");
    // We make this assertion to keep the logic simpler:
    std::static_assert(N * 31 >= M, "Too many output bytes specified.");

    for i in 0..N - 1 {
        let field = fields[i];

        // We expect that the field contains at most 31 bytes of information.
        field.assert_max_bit_size::<248>();

        // Now we can safely convert the field to 31 bytes.
        let field_as_bytes: [u8; 31] = field.to_le_bytes();

        for j in 0..31 {
            bytes[i * 31 + j] = field_as_bytes[j];
        }
    }

    // The final field will be
    let final_field = fields[N - 1];
    final_field.assert_max_bit_size::<8 * (M - ((N - 1) * 31))>();

    let final_field_as_bytes: [u8; M - ((N - 1) * 31)] = final_field.to_le_bytes();

    let start_index = (N - 1) * 31;
    for j in 0..M - ((N - 1) * 31) {
        bytes[start_index + j] = final_field_as_bytes[j];
    }

    bytes
}

pub fn fields_to_be_bytes_32<let N: u32>(fields: [Field; N]) -> [u8; 32 * N] {
    let mut bytes = [0; 32 * N];

    for i in 0..N {
        let field = fields[i];
        let field_as_bytes: [u8; 32] = field.to_be_bytes();

        for j in 0..32 {
            bytes[i * 32 + j] = field_as_bytes[j];
        }
    }

    bytes
}

unconstrained fn byte_to_bits(byte: u8) -> [u1; 8] {
    let mut mut_byte = byte;
    let mut bits: [u1; 8] = [0; 8];
    for i in 0..8 {
        bits[i] = (mut_byte & 1) as u1;
        mut_byte >>= 1;
    }
    bits
}

pub unconstrained fn get_random_bytes<let N: u32>() -> [u8; N] {
    let mut bytes = [0; N];
    let mut idx = 32;
    let mut randomness = [0; 32];
    for i in 0..N {
        if idx == 32 {
            randomness = random().to_be_bytes();
            idx = 1; // Skip the first byte as it's always 0.
        }
        bytes[i] = randomness[idx];
        idx += 1;
    }
    bytes
}

unconstrained fn get_random_bits<let N: u32>() -> [u1; N] {
    // Note: (N + 7) / 8 = ceil(N / 8)
    let bytes = get_random_bytes::<(N + 7) / 8>();
    let mut bits: [u1; N] = [0; N];
    for i in 0..bytes.len() - 1 {
        let mut byte = bytes[i];
        for j in 0..8 {
            let bit_idx = i * 8 + j;
            bits[bit_idx] = (byte & 1) as u1;
            byte >>= 1;
        }
    }

    // N - ((N / 8) * 8) = N - floor(N/8) * 8 = the number of bits remaining.
    let byte_idx = bytes.len() - 1;
    let mut byte = bytes[byte_idx];
    for j in 0..N - ((N / 8) * 8) {
        let bit_idx = (byte_idx) * 8 + j;
        bits[bit_idx] = (byte & 1) as u1;
        byte >>= 1;
    }

    bits
}

unconstrained fn get_chunks_of_random_bits<let NUM_CHUNKS: u32, let NUM_BITS: u32>() -> [[u1; NUM_BITS]; NUM_CHUNKS] {
    let random_bits = get_random_bits::<NUM_CHUNKS * NUM_BITS>();
    let mut chunks: [[u1; NUM_BITS]; NUM_CHUNKS] = [[0; NUM_BITS]; NUM_CHUNKS];
    for i in 0..NUM_CHUNKS {
        let mut chunk: [u1; NUM_BITS] = [0; NUM_BITS];
        for j in 0..NUM_BITS {
            chunk[j] = random_bits[i * NUM_BITS + j];
        }
        chunks[i] = chunk;
    }
    chunks
}

/**
 * Helper fn for be/le_bytes_to_padded_fields() fns.
 */
fn pad_31_byte_fields_with_random_bits<let N: u32>(input: [Field; N]) -> [Field; N] {
    let chunks_of_random_bits = unsafe { get_chunks_of_random_bits::<((N + 30) / 31), 6>() };
    let mut fields = input;
    // We push the random bits to the "big end" of each field
    let TWO_POW_248 = 0x100000000000000000000000000000000000000000000000000000000000000;
    for i in 0..fields.len() {
        let mut shift = TWO_POW_248;
        for j in 0..5 {
            fields[i] += shift * chunks_of_random_bits[i][j] as Field;
            shift *= 2;
        }

        // This might overflow the field modulus, so we need to be careful.
        // By this point, shift = 2 ^ 253, so will populate the 254th bit (counting from 1)
        let field_with_254th_bit = fields[i] + shift * chunks_of_random_bits[i][6 - 1] as Field;

        // Expensive comparison (one for each field), but it's important -- if we want to hide that we were
        // working with bytes -- that we include the 254th random bit when it fits.
        fields[i] = if (fields[i].lt(field_with_254th_bit)) {
            field_with_254th_bit
        } else {
            fields[i]
        };
    }
    fields
}

/**
 * The above functions be_bytes_31_to_fields and le_bytes_31_to_fields have a privacy-leakage problem:
 * they result in fields which are all 248-bits instead of 254-bits.
 * That means if the above functions are used to convert a ciphertext from bytes to
 * fields, it leaks (with very high probability) to all observers of the log that the
 * ciphertext was created with a "bit twiddly" encryption scheme like AES.
 * This reduces privacy sets for all apps.
 *
 * This function seeks to "pad" those remaining 6 bits with randomness, so that all
 * encrypted logs look even more similar (full fields of 254-bits of random-looking
 * information). Of course, this adds some extra constraints, unfortunately.
 */
pub fn le_bytes_to_padded_fields<let N: u32>(input: [u8; N]) -> [Field; (N + 30) / 31] {
    let mut fields = le_bytes_31_to_fields(input);
    pad_31_byte_fields_with_random_bits(fields)
}

pub fn be_bytes_to_padded_fields<let N: u32>(input: [u8; N]) -> [Field; (N + 30) / 31] {
    let mut fields = be_bytes_31_to_fields(input);
    pad_31_byte_fields_with_random_bits(fields)
}

mod test {
    use crate::utils::bytes::{
        be_bytes_31_to_fields, fields_to_be_bytes_31, fields_to_le_bytes_31, le_bytes_31_to_fields,
    };

    // BE BYTES

    #[test]
    fn test_be_bytes_31_to_1_field() {
        let input = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            25, 26, 27, 28, 29, 30, 31,
        ];
        let output = be_bytes_31_to_fields(input);

        assert_eq(output[0], 0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f);
    }

    #[test]
    fn test_1_field_to_be_bytes_31() {
        let input = [0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f];
        let output: [u8; 31] = fields_to_be_bytes_31(input);

        assert_eq(
            output,
            [
                1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
                24, 25, 26, 27, 28, 29, 30, 31,
            ],
        );
    }

    #[test]
    fn test_3_small_fields_to_be_bytes_31() {
        let input = [1, 2, 3];
        let output: [u8; 93] = fields_to_be_bytes_31(input);

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
    fn test_3_small_fields_to_fewer_be_bytes() {
        let input = [1, 2, 3];
        let output: [u8; 63] = fields_to_be_bytes_31(input);
        println(f"output: {output}");

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
    fn test_be_bytes_31_to_2_fields() {
        let input = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46,
            47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59,
        ];
        let output = be_bytes_31_to_fields(input);

        assert_eq(output[0], 0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f);
        assert_eq(output[1], 0x202122232425262728292a2b2c2d2e2f303132333435363738393a3b);
    }

    #[test]
    fn test_2_fields_to_be_bytes_31() {
        let input = [
            0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f,
            0x202122232425262728292a2b2c2d2e2f303132333435363738393a3b,
        ];
        let output: [u8; 62] = fields_to_be_bytes_31(input);

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
    fn test_large_random_be_bytes_31_input_to_fields_and_back(input: [u8; 128]) {
        let output = be_bytes_31_to_fields(input);
        let input_back: [u8; 128] = fields_to_be_bytes_31(output);

        assert_eq(input, input_back);
    }

    // I need to get an array of random values lower than 2^248 on input and since there is no u248 type and modulo
    // operation is not supported on a Field (to do field % 2^248), I will take multiple smaller values and combine
    // them to get a value lower than 2^248.
    #[test]
    fn test_large_random_input_to_be_bytes_31_and_back(
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

        let output: [u8; 155] = fields_to_be_bytes_31(input);
        let input_back = be_bytes_31_to_fields(output);

        assert_eq(input, input_back);
    }

    #[test(should_fail_with = "call to assert_max_bit_size")]
    fn test_too_few_destination_be_bytes() {
        // We should get an error here because first field gets converted to 31 bytes and the second field needs
        // at least 2 bytes but we provide it with 1.
        let input = [1, 256];
        let _ignored_result: [u8; 32] = fields_to_be_bytes_31(input);
    }

    #[test(should_fail_with = "call to assert_max_bit_size")]
    fn test_fields_to_be_bytes_31_value_too_large() {
        let input = [2.pow_32(248)]; // this number is 1 bit larger than 31 bytes.
        let _ignored_result: [u8; 31] = fields_to_be_bytes_31(input);
    }

    #[test]
    fn test_fields_to_be_bytes_31_max_value() {
        let input = [2.pow_32(248) - 1];
        let result: [u8; 31] = fields_to_be_bytes_31(input);

        // We check that all the bytes were set to max value (255)
        for i in 0..31 {
            assert_eq(result[i], 255);
        }
    }

    // LE BYTES

    #[test]
    fn test_le_bytes_31_to_1_field() {
        let input = [
            31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10,
            9, 8, 7, 6, 5, 4, 3, 2, 1,
        ];
        let output = le_bytes_31_to_fields(input);

        assert_eq(output[0], 0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f);
    }

    #[test]
    fn test_1_field_to_le_bytes_31() {
        let input = [0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f];
        let output: [u8; 31] = fields_to_le_bytes_31(input);

        assert_eq(
            output,
            [
                31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11,
                10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
            ],
        );
    }

    #[test]
    fn test_3_small_fields_to_le_bytes_31() {
        let input = [1, 2, 3];
        let output: [u8; 93] = fields_to_le_bytes_31(input);

        // Each field should occupy 31 bytes with the non-zero value being placed in the last one.
        assert_eq(
            output,
            [
                1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0,
            ],
        );
    }

    #[test]
    fn test_3_small_fields_to_fewer_le_bytes() {
        let input = [1, 2, 3];
        let output: [u8; 63] = fields_to_le_bytes_31(input);

        // First 2 fields should occupy 31 bytes with the non-zero value being placed in the last one while the last
        // field should occupy 1 byte. There is not information destruction here because the last field fits into
        // 1 byte.
        assert_eq(
            output,
            [
                1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 3,
            ],
        );
    }

    #[test]
    fn test_le_bytes_31_to_2_fields() {
        let input = [
            59, 58, 57, 56, 55, 54, 53, 52, 51, 50, 49, 48, 47, 46, 45, 44, 43, 42, 41, 40, 39, 38,
            37, 36, 35, 34, 33, 32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16,
            15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
        ];
        let output = le_bytes_31_to_fields(input);

        assert_eq(output[0], 0x1d1e1f202122232425262728292a2b2c2d2e2f303132333435363738393a3b);
        assert_eq(output[1], 0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c);
    }

    #[test]
    fn test_2_fields_to_le_bytes_31() {
        let input = [
            0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f,
            0x202122232425262728292a2b2c2d2e2f303132333435363738393a3b,
        ];
        let output: [u8; 62] = fields_to_le_bytes_31(input);

        assert_eq(
            output,
            [
                31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11,
                10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 59, 58, 57, 56, 55, 54, 53, 52, 51, 50, 49, 48, 47,
                46, 45, 44, 43, 42, 41, 40, 39, 38, 37, 36, 35, 34, 33, 32, 0, 0, 0,
            ],
        );
    }

    #[test]
    fn test_large_random_le_bytes_input_to_fields_and_back(input: [u8; 128]) {
        let output = le_bytes_31_to_fields(input);
        let input_back: [u8; 128] = fields_to_le_bytes_31(output);

        assert_eq(input, input_back);
    }

    // I need to get an array of random values lower than 2^248 on input and since there is no u248 type and modulo
    // operation is not supported on a Field (to do field % 2^248), I will take multiple smaller values and combine
    // them to get a value lower than 2^248.
    #[test]
    fn test_large_random_input_to_le_bytes_and_back(
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

        let output: [u8; 155] = fields_to_le_bytes_31(input);
        let input_back = le_bytes_31_to_fields(output);

        assert_eq(input, input_back);
    }

    #[test(should_fail_with = "call to assert_max_bit_size")]
    fn test_too_few_destination_le_bytes() {
        // We should get an error here because first field gets converted to 31 bytes and the second field needs
        // at least 2 bytes but we provide it with 1.
        let input = [1, 256];
        let _ignored_result: [u8; 32] = fields_to_le_bytes_31(input);
    }

    #[test(should_fail_with = "call to assert_max_bit_size")]
    fn test_fields_to_le_bytes_31_value_too_large() {
        let input = [2.pow_32(248)];
        let _ignored_result: [u8; 31] = fields_to_le_bytes_31(input);
    }

    #[test]
    fn test_fields_to_le_bytes_31_max_value() {
        let input = [2.pow_32(248) - 1];
        let result: [u8; 31] = fields_to_le_bytes_31(input);

        // We check that all the bytes were set to max value (255)
        for i in 0..31 {
            assert_eq(result[i], 255);
        }
    }
}
