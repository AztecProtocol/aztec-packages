// TODO: NUKE THIS FILE - COPIED HERE TO UNBLOCK MYSELF
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
