// Converts the input bytes into an array of fields. A Field is ~254 bits meaning that each field can store 31 bytes.
// This implies that M = ceil(N / 31).
pub fn bytes_to_fields<let N: u32, let M: u32>(input: [u8; N]) -> [Field; M] {
    let mut output = [0; M];

    for field_index in 0..M {
        let mut field_value = 0;

        for i in 0..31 {
            let byte_index = field_index * 31 + i;
            if byte_index < N {
                // Shift the existing value left by 8 bits and add the new byte
                field_value = field_value * 256 + input[byte_index] as Field;
            }
        }

        output[field_index] = field_value;
    }

    output
}

// Converts the input array of fields into bytes. Each field of input has to contain only 31 bytes.
pub fn fields_to_bytes<let N: u32, let M: u32>(input: [Field; M]) -> [u8; N] {
    let mut output = [0; N];

    for field_index in 0..M {
        // We convert the field to 31 bytes. Normally a field is 254 bits, but we only used 248 bits
        // in `bytes_to_fields` so we can safely convert it to 31 bytes.
        let field_value_bytes: [u8; 31] = input[field_index].to_be_bytes();

        for i in 0..31 {
            let byte_index = field_index * 31 + i;
            output[byte_index] = field_value_bytes[i];
        }
    }

    output
}

mod test {
    use crate::utils::bytes::{bytes_to_fields, fields_to_bytes};

    #[test]
    fn test_bytes_to_1_field() {
        let input = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31
        ];
        let output = bytes_to_fields::<31, 1>(input);

        assert_eq(output[0], 0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f);
    }

    #[test]
    fn test_1_field_to_bytes() {
        let input = [0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f];
        let output = fields_to_bytes::<31, 1>(input);

        assert_eq(
            output, [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31
        ]
        );
    }

    #[test]
    fn test_bytes_to_2_fields() {
        let input = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59
        ];
        let output = bytes_to_fields::<59, 2>(input);

        assert_eq(output[0], 0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f);
        assert_eq(output[1], 0x202122232425262728292a2b2c2d2e2f303132333435363738393a3b);
    }

    #[test]
    fn test_2_fields_to_bytes() {
        let input = [
            0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f, 0x202122232425262728292a2b2c2d2e2f303132333435363738393a3b
        ];
        let output = fields_to_bytes::<62, 2>(input);

        assert_eq(
            output, [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 0, 0, 0, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59
        ]
        );
    }

    #[test]
    fn test_large_random_input_to_fields_and_back() {
        let input = [
            0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
            0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20,
            0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f, 0x30,
            0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f, 0x40,
            0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x4f, 0x50,
            0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x5b, 0x5c, 0x5d, 0x5e, 0x5f, 0x60,
            0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x6b, 0x6c, 0x6d, 0x6e, 0x6f, 0x70,
            0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x7b, 0x7c, 0x7d, 0x7e, 0x7f, 0x80
        ];
        let output = bytes_to_fields::<128, 5>(input);
        let input_back = fields_to_bytes::<155, 5>(output);

        std::println(input_back);
    }
}
