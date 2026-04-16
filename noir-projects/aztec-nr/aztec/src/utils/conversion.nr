pub mod bytes_as_fields;
pub mod fields_as_bytes;

// Deprecated wrappers. TODO(F-371): remove these once external contracts have migrated.

#[deprecated("use decode_bytes_from_fields from bytes_as_fields")]
pub fn bytes_from_fields<let N: u32>(fields: BoundedVec<Field, N>) -> BoundedVec<u8, N * 31> {
    bytes_as_fields::decode_bytes_from_fields(fields)
}

#[deprecated("use encode_bytes_as_fields from bytes_as_fields")]
pub fn bytes_to_fields<let N: u32>(bytes: [u8; N]) -> [Field; N / 31] {
    bytes_as_fields::encode_bytes_as_fields(bytes)
}

#[deprecated("use decode_fields_from_bytes from fields_as_bytes")]
pub fn fields_from_bytes<let N: u32>(bytes: BoundedVec<u8, N>) -> BoundedVec<Field, N / 32> {
    fields_as_bytes::decode_fields_from_bytes(bytes)
}

#[deprecated("use encode_fields_as_bytes from fields_as_bytes")]
pub fn fields_to_bytes<let N: u32>(fields: [Field; N]) -> [u8; 32 * N] {
    fields_as_bytes::encode_fields_as_bytes(fields)
}
