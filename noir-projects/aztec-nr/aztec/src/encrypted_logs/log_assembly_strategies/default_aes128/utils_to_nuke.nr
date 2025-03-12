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

/// Converts an input BoundedVec of fields into a BoundedVec of bytes in big-endian order.
///
/// Each input field must contain at most 31 bytes (this is constrained to be so).
/// Each field is converted into 31 big-endian bytes, and the resulting 31-byte chunks are concatenated
/// back together in the order of the original fields.
///
/// This function is expected to be used along with `be_bytes_31_to_fields` to convert a BoundedVec of bytes into
/// a BoundedVec of fields and then back to bytes.
pub fn fields_to_be_bytes_31<let N: u32>(fields: BoundedVec<Field, N>) -> BoundedVec<u8, N * 31> {
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

pub fn be_bytes_32_to_fields<let N: u32>(
    bytes: BoundedVec<u8, N>,
) -> BoundedVec<Field, (N + 31) / 32> {
    let mut fields = BoundedVec::new();

    // There are "bytes.len() / 32" whole fields that can be populated.
    for i in 0..bytes.len() / 32 {
        let mut field = 0;
        for j in 0..32 {
            // Shift the existing value left by 8 bits and add the new byte
            field = field * 256 + bytes.get(i * 32 + j) as Field;
        }
        fields.push(field);
    }

    // Note: if 32 divides bytes.len(), then this loop does not execute.
    // ceil(bytes.len()/32) - floor(bytes.len()/32) = 1, unless 32 divides bytes.len(), in which case it's 0.
    for _ in 0..((bytes.len() + 31) / 32) - (bytes.len() / 32) {
        let mut final_field = 0;
        let final_field_idx = fields.len();
        let final_offset = final_field_idx * 32;
        // bytes.len() - ((bytes.len() / 32) * 32) = bytes.len() - floor(bytes.len()/32) * 32 = the number of bytes
        // to go in the final field.
        for j in 0..bytes.len() - ((bytes.len() / 32) * 32) {
            // Shift the existing value left by 8 bits and add the new byte
            final_field = final_field * 256 + bytes.get(final_offset + j) as Field;
        }

        fields.push(final_field);
    }

    fields
}
