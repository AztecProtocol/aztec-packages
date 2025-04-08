global U64_SHIFT_MULTIPLIER: Field = 2.pow_32(64);

pub fn to_expanded_metadata(msg_type: u64, msg_metadata: u64) -> Field {
    // We use multiplication instead of bit shifting operations to shift the type bits as bit shift operations are
    // expensive in circuits.
    let type_field: Field = (msg_type as Field) * U64_SHIFT_MULTIPLIER;
    let msg_metadata_field = msg_metadata as Field;

    type_field + msg_metadata_field
}

pub fn from_expanded_metadata(input: Field) -> (u64, u64) {
    input.assert_max_bit_size::<128>();
    let msg_metadata = (input as u64);
    let msg_type = ((input - (msg_metadata as Field)) / U64_SHIFT_MULTIPLIER) as u64;
    // Use division instead of bit shift since bit shifts are expensive in circuits
    (msg_type, msg_metadata)
}

mod tests {
    use super::{from_expanded_metadata, to_expanded_metadata};

    global U64_MAX: u64 = (2.pow_32(64) - 1) as u64;
    global U128_MAX: Field = (2.pow_32(128) - 1);

    #[test]
    fn packing_metadata() {
        // Test case 1: All bits set
        let packed = to_expanded_metadata(U64_MAX, U64_MAX);
        let (msg_type, msg_metadata) = from_expanded_metadata(packed);
        assert_eq(msg_type, U64_MAX);
        assert_eq(msg_metadata, U64_MAX);

        // Test case 2: Only log type bits set
        let packed = to_expanded_metadata(U64_MAX, 0);
        let (msg_type, msg_metadata) = from_expanded_metadata(packed);
        assert_eq(msg_type, U64_MAX);
        assert_eq(msg_metadata, 0);

        // Test case 3: Only msg_metadata bits set
        let packed = to_expanded_metadata(0, U64_MAX);
        let (msg_type, msg_metadata) = from_expanded_metadata(packed);
        assert_eq(msg_type, 0);
        assert_eq(msg_metadata, U64_MAX);

        // Test case 4: No bits set
        let packed = to_expanded_metadata(0, 0);
        let (msg_type, msg_metadata) = from_expanded_metadata(packed);
        assert_eq(msg_type, 0);
        assert_eq(msg_metadata, 0);
    }

    #[test]
    fn unpacking_metadata() {
        // Test case 1: All bits set
        let input = U128_MAX as Field;
        let (msg_type, msg_metadata) = from_expanded_metadata(input);
        assert_eq(msg_type, U64_MAX);
        assert_eq(msg_metadata, U64_MAX);

        // Test case 2: Only log type bits set
        let input = (U128_MAX - U64_MAX as Field);
        let (msg_type, msg_metadata) = from_expanded_metadata(input);
        assert_eq(msg_type, U64_MAX);
        assert_eq(msg_metadata, 0);

        // Test case 3: Only msg_metadata bits set
        let input = U64_MAX as Field;
        let (msg_type, msg_metadata) = from_expanded_metadata(input);
        assert_eq(msg_type, 0);
        assert_eq(msg_metadata, U64_MAX);

        // Test case 4: No bits set
        let input = 0;
        let (msg_type, msg_metadata) = from_expanded_metadata(input);
        assert_eq(msg_type, 0);
        assert_eq(msg_metadata, 0);
    }

    #[test]
    fn roundtrip_metadata(original_msg_type: u64, original_msg_metadata: u64) {
        let packed = to_expanded_metadata(original_msg_type, original_msg_metadata);
        let (unpacked_msg_type, unpacked_msg_metadata) = from_expanded_metadata(packed);

        assert_eq(original_msg_type, unpacked_msg_type);
        assert_eq(original_msg_metadata, unpacked_msg_metadata);
    }
}
