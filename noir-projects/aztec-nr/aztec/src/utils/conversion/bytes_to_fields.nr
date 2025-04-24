use std::static_assert;

// These functions are used to facilitate the conversion of log ciphertext between byte and field representations.
//
// `bytes_to_fields` uses fixed-size arrays since encryption contexts have compile-time size information.
// `bytes_from_fields` uses BoundedVec for flexibility in unconstrained contexts where sizes are dynamic.
//
// Together they provide bidirectional conversion between bytes and fields when processing encrypted logs.

/// Converts the input bytes into an array of fields. A Field is ~254 bits meaning that each field can store 31 whole
/// bytes. Use `bytes_from_fields` to obtain the original bytes array.
///
/// The input bytes are chunked into chunks of 31 bytes. Each 31-byte chunk is viewed as big-endian, and is converted
/// into a Field.
/// For example, [1, 10, 3, ..., 0] (31 bytes) is encoded as [1 * 256^30 + 10 * 256^29 + 3 * 256^28 + ... + 0]
/// Note: N must be a multiple of 31 bytes
pub fn bytes_to_fields<let N: u32>(bytes: [u8; N]) -> [Field; N / 31] {
    // Assert that N is a multiple of 31
    static_assert(N % 31 == 0, "N must be a multiple of 31");

    let mut fields = [0; N / 31];

    // Since N is a multiple of 31, we can simply process all chunks fully
    for i in 0..N / 31 {
        let mut field = 0;
        for j in 0..31 {
            // Shift the existing value left by 8 bits and add the new byte
            field = field * 256 + bytes[i * 31 + j] as Field;
        }
        fields[i] = field;
    }

    fields
}

/// Converts an input BoundedVec of fields into a BoundedVec of bytes in big-endian order. Arbitrary Field arrays
/// are not allowed: this is assumed to be an array obtained via `bytes_to_fields`, i.e. one that actually represents
/// bytes. To convert a Field array into bytes, use `fields_to_bytes`.
///
/// Each input field must contain at most 31 bytes (this is constrained to be so).
/// Each field is converted into 31 big-endian bytes, and the resulting 31-byte chunks are concatenated
/// back together in the order of the original fields.
pub fn bytes_from_fields<let N: u32>(fields: BoundedVec<Field, N>) -> BoundedVec<u8, N * 31> {
    let mut bytes = BoundedVec::new();

    for i in 0..fields.len() {
        let field = fields.get(i);

        // We expect that the field contains at most 31 bytes of information.
        field.assert_max_bit_size::<248>();

        // Now we can safely convert the field to 31 bytes.
        let field_as_bytes: [u8; 31] = field.to_be_bytes();

        for j in 0..31 {
            bytes.push(field_as_bytes[j]);
        }
    }

    bytes
}

mod tests {
    use crate::utils::array::subarray;
    use super::{bytes_from_fields, bytes_to_fields};

    #[test]
    unconstrained fn random_bytes_to_fields_and_back(input: [u8; 93]) {
        let fields = bytes_to_fields(input);

        // At this point in production, the log flies through the system and we get a BoundedVec on the other end.
        // So we need to convert the field array to a BoundedVec to be able to feed it to the `bytes_from_fields`
        // function.
        let fields_as_bounded_vec = BoundedVec::<_, 6>::from_array(fields);

        let bytes_back = bytes_from_fields(fields_as_bounded_vec);

        // Compare the original input with the round-tripped result
        assert_eq(bytes_back.len(), input.len());
        assert_eq(subarray(bytes_back.storage(), 0), input);
    }

    #[test(should_fail_with = "N must be a multiple of 31")]
    unconstrained fn bytes_to_fields_input_length_not_multiple_of_31() {
        // Try to convert 32 bytes (not a multiple of 31) to fields
        let _fields = bytes_to_fields([0; 32]);
    }

}
