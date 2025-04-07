global U64_SHIFT_MULTIPLIER: Field = 2.pow_32(64);

pub fn to_expanded_metadata(log_metadata: u64, log_type: u64) -> Field {
    let metadata_field = log_metadata as Field;
    // We use multiplication instead of bit shifting operations to shift the type bits as bit shift operations are
    // expensive in circuits.
    let type_field: Field = (log_type as Field) * U64_SHIFT_MULTIPLIER;
    type_field + metadata_field
}

pub fn from_expanded_metadata(input: Field) -> (u64, u64) {
    input.assert_max_bit_size::<128>();
    let metadata = (input as u64);
    // Use division instead of bit shift since bit shifts are expensive in circuits
    let log_type = ((input - (metadata as Field)) / U64_SHIFT_MULTIPLIER) as u64;
    (metadata, log_type)
}

mod tests {
    use super::{from_expanded_metadata, to_expanded_metadata};

    global U64_MAX: Field = 2.pow_32(64) - 1;
    global U128_MAX: Field = 2.pow_32(128) - 1;

    #[test]
    fn packing_metadata() {
        // Test case 1: All bits set
        let packed = to_expanded_metadata(U64_MAX as u64, U64_MAX as u64);
        let (metadata, log_type) = from_expanded_metadata(packed);
        assert(metadata == U64_MAX as u64, "Metadata bits should be all 1s");
        assert(log_type == U64_MAX as u64, "Log type bits should be all 1s");

        // Test case 2: Only log type bits set
        let packed = to_expanded_metadata(0, U64_MAX as u64);
        let (metadata, log_type) = from_expanded_metadata(packed);
        assert(metadata == 0, "Metadata bits should be 0");
        assert(log_type == U64_MAX as u64, "Log type bits should be all 1s");

        // Test case 3: Only metadata bits set
        let packed = to_expanded_metadata(U64_MAX as u64, 0);
        let (metadata, log_type) = from_expanded_metadata(packed);
        assert(metadata == U64_MAX as u64, "Metadata bits should be all 1s");
        assert(log_type == 0, "Log type bits should be 0");

        // Test case 4: Zero
        let packed = to_expanded_metadata(0, 0);
        let (metadata, log_type) = from_expanded_metadata(packed);
        assert(metadata == 0, "Metadata bits should be 0");
        assert(log_type == 0, "Log type bits should be 0");
    }

    #[test]
    fn unpacking_metadata() {
        // Test case 1: All bits set
        let input = U128_MAX;
        let (metadata, log_type) = from_expanded_metadata(input);
        assert(metadata == U64_MAX as u64, "Metadata bits should be all 1s");
        assert(log_type == U64_MAX as u64, "Log type bits should be all 1s");

        // Test case 2: Only log type bits set
        let input = U128_MAX - U64_MAX;
        let (metadata, log_type) = from_expanded_metadata(input);
        assert(metadata == 0, "Metadata bits should be 0");
        assert(log_type == U64_MAX as u64, "Log type bits should be all 1s");

        // Test case 3: Only metadata bits set
        let input = U64_MAX;
        let (metadata, log_type) = from_expanded_metadata(input);
        assert(metadata == U64_MAX as u64, "Metadata bits should be all 1s");
        assert(log_type == 0, "Log type bits should be 0");

        // Test case 4: Zero
        let input = 0;
        let (metadata, log_type) = from_expanded_metadata(input);
        assert(metadata == 0, "Metadata bits should be 0");
        assert(log_type == 0, "Log type bits should be 0");
    }

    #[test]
    fn roundtrip_metadata(original_metadata: u64, original_type: u64) {
        let packed = to_expanded_metadata(original_metadata, original_type);
        let (unpacked_metadata, unpacked_type) = from_expanded_metadata(packed);
        assert(original_type == unpacked_type, "Log type bits should match after roundtrip");
        assert(
            original_metadata == unpacked_metadata,
            "Metadata bits should match after roundtrip",
        );
    }
}
