global U64_SHIFT_MULTIPLIER: Field = 2.pow_32(64);

pub fn pack_two_u64s(high: u64, low: u64) -> Field {
    let low_field = low as Field;
    // We use multiplication instead of bit shifting operations to shift the high bits as bit shift operations are
    // expensive in circuits.
    let high_field: Field = (high as Field) * U64_SHIFT_MULTIPLIER;
    high_field + low_field
}

pub fn unpack_two_u64s(input: Field) -> (u64, u64) {
    input.assert_max_bit_size::<128>();
    let low = (input as u64);
    // Use division instead of bit shift since bit shifts are expensive in circuits
    let high = ((input - (low as Field)) / U64_SHIFT_MULTIPLIER) as u64;
    (high, low)
}

mod tests {
    use super::{pack_two_u64s, unpack_two_u64s};

    global U64_MAX: Field = 2.pow_32(64) - 1;
    global U128_MAX: Field = 2.pow_32(128) - 1;

    #[test]
    fn packing_two_u64s() {
        // Test case 1: All bits set
        let packed = pack_two_u64s(U64_MAX as u64, U64_MAX as u64);
        let (upper, lower) = unpack_two_u64s(packed);
        assert(lower == U64_MAX as u64, "Lower 64 bits should be all 1s");
        assert(upper == U64_MAX as u64, "Upper 64 bits should be all 1s");

        // Test case 2: Only upper 64 bits set
        let packed = pack_two_u64s(U64_MAX as u64, 0);
        let (upper, lower) = unpack_two_u64s(packed);
        assert(lower == 0, "Lower 64 bits should be 0");
        assert(upper == U64_MAX as u64, "Upper 64 bits should be all 1s");

        // Test case 3: Only lower 64 bits set
        let packed = pack_two_u64s(0, U64_MAX as u64);
        let (upper, lower) = unpack_two_u64s(packed);
        assert(lower == U64_MAX as u64, "Lower 64 bits should be all 1s");
        assert(upper == 0, "Upper 64 bits should be 0");

        // Test case 4: Zero
        let packed = pack_two_u64s(0, 0);
        let (upper, lower) = unpack_two_u64s(packed);
        assert(lower == 0, "Lower 64 bits should be 0");
        assert(upper == 0, "Upper 64 bits should be 0");
    }

    #[test]
    fn unpacking_two_u64s() {
        // Test case 1: All bits set
        let input = U128_MAX;
        let (upper, lower) = unpack_two_u64s(input);
        assert(lower == U64_MAX as u64, "Lower 64 bits should be all 1s");
        assert(upper == U64_MAX as u64, "Upper 64 bits should be all 1s");

        // Test case 2: Only upper 64 bits set
        let input = U128_MAX - U64_MAX;
        let (upper, lower) = unpack_two_u64s(input);
        assert(lower == 0, "Lower 64 bits should be 0");
        assert(upper == U64_MAX as u64, "Upper 64 bits should be all 1s");

        // Test case 3: Only lower 64 bits set
        let input = U64_MAX;
        let (upper, lower) = unpack_two_u64s(input);
        assert(lower == U64_MAX as u64, "Lower 64 bits should be all 1s");
        assert(upper == 0, "Upper 64 bits should be 0");

        // Test case 4: Zero
        let input = 0;
        let (upper, lower) = unpack_two_u64s(input);
        assert(lower == 0, "Lower 64 bits should be 0");
        assert(upper == 0, "Upper 64 bits should be 0");
    }

    #[test]
    fn roundtrip_two_u64s() {
        let original_upper = 12345;
        let original_lower = 67890;
        let packed = pack_two_u64s(original_upper, original_lower);
        let (unpacked_upper, unpacked_lower) = unpack_two_u64s(packed);
        assert(original_upper == unpacked_upper, "Upper 64 bits should match after roundtrip");
        assert(original_lower == unpacked_lower, "Lower 64 bits should match after roundtrip");
    }
}
