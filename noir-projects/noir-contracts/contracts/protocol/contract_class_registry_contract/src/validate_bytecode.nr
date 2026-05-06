use aztec::{
    hash::compute_public_bytecode_commitment,
    protocol::constants::MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS,
};

pub(crate) fn validate_packed_public_bytecode(
    packed_public_bytecode: [Field; MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS],
    public_bytecode_commitment: Field,
) {
    validate_bytes_encoding(packed_public_bytecode);

    assert_eq(
        compute_public_bytecode_commitment(packed_public_bytecode),
        public_bytecode_commitment,
    );
}

fn validate_bytes_encoding(
    packed_public_bytecode: [Field; MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS],
) {
    // Validate bit size of bytecode length
    packed_public_bytecode[0].assert_max_bit_size::<32>();
    // 31 bytes per field, the odd upper bits MUST be 0
    for i in 1..MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS {
        packed_public_bytecode[i].assert_max_bit_size::<248>();
    }

    // check that the last field doesn't include garbage after bytes length.
    let bytecode_length_in_bytes = packed_public_bytecode[0] as u32;
    let not_aligned_bytes = bytecode_length_in_bytes % 31;

    let bytecode_length_in_fields =
        (bytecode_length_in_bytes / 31) + (not_aligned_bytes != 0) as u32;

    // We don't -1 because the first field is the bytes length
    let decomposition: [u8; 32] = packed_public_bytecode[bytecode_length_in_fields].to_be_bytes();

    let expected_populated_bytes = if not_aligned_bytes == 0 {
        31
    } else {
        not_aligned_bytes
    };

    let mut should_be_zero = false;
    for i in 0..32 {
        // +1 since we don't check the MSB (since it was already checked by assert_max_bit_size)
        should_be_zero |= i == (expected_populated_bytes + 1);

        if should_be_zero {
            assert_eq(decomposition[i], 0, "Extra bytes in the last field of the bytecode");
        }
    }
}

#[test]
fn test_validate_bytes_encoding() {
    let mut packed_public_bytecode = [0; MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS];
    packed_public_bytecode[0] = 30;
    // Upper bits clean, no extra trailing bytes
    let bytes = [
        0x0, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
        0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d,
        0x1e, 0x00,
    ];
    packed_public_bytecode[1] = Field::from_be_bytes(bytes);

    validate_bytes_encoding(packed_public_bytecode);
}

#[test(should_fail_with = "assert_max_bit_size")]
fn test_should_fail_too_large_bytecode_length() {
    let mut packed_public_bytecode = [0; MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS];
    packed_public_bytecode[0] = 0x100000000;
    validate_bytes_encoding(packed_public_bytecode);
}

#[test(should_fail_with = "assert_max_bit_size")]
fn test_should_fail_populated_upper_bits() {
    let mut packed_public_bytecode = [0; MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS];
    packed_public_bytecode[0] = 30;
    // one upper bit populated
    let bytes = [
        0x01, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
        0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d,
        0x1e, 0x00,
    ];
    packed_public_bytecode[1] = Field::from_be_bytes(bytes);

    validate_bytes_encoding(packed_public_bytecode);
}

#[test(should_fail_with = "Extra bytes in the last field of the bytecode")]
fn test_should_fail_extra_bytes_in_last_field() {
    let mut packed_public_bytecode = [0; MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS];
    packed_public_bytecode[0] = 30;
    // Last one should be zero
    let bytes = [
        0x0, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
        0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d,
        0x1e, 0x01,
    ];
    packed_public_bytecode[1] = Field::from_be_bytes(bytes);

    validate_bytes_encoding(packed_public_bytecode);
}
