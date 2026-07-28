//! Efficient string storage.

mod compressed_string;
pub use compressed_string::CompressedString;
mod field_compressed_string;
pub use field_compressed_string::FieldCompressedString;
