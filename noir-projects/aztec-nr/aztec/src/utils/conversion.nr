pub mod bytes_as_fields;
pub mod fields_as_bytes;

// Backward-compatibility aliases for the pre-rename API (see F-371). External contract consumers may still import
// these names from `conversion`. TODO(F-371): clean this up

pub use bytes_as_fields::decode_bytes_from_fields as bytes_from_fields;
pub use bytes_as_fields::encode_bytes_as_fields as bytes_to_fields;
pub use fields_as_bytes::decode_fields_from_bytes as fields_from_bytes;
pub use fields_as_bytes::encode_fields_as_bytes as fields_to_bytes;
