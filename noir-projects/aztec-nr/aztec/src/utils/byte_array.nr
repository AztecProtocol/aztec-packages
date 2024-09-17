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
