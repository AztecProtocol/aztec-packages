use dep::aztec::protocol_types::{
    traits::{Deserialize, Packable, Serialize},
    utils::field::field_from_bytes,
};
use std::meta::derive;

// A Fixedsize Compressed String.
// Essentially a special version of Compressed String for practical use.
#[derive(Serialize, Deserialize)]
pub struct FieldCompressedString {
    value: Field,
}

/// We implement the Packable trait for FieldCompressedString because it can be stored in contract's storage
/// (and there the implementation of Packable is required).
impl Packable<1> for FieldCompressedString {
    fn pack(self) -> [Field; 1] {
        self.serialize()
    }

    fn unpack(input: [Field; 1]) -> Self {
        Self::deserialize(input)
    }
}

impl FieldCompressedString {
    pub fn is_eq(self, other: FieldCompressedString) -> bool {
        self.value == other.value
    }

    pub fn from_field(input_field: Field) -> Self {
        Self { value: input_field }
    }

    pub fn from_string(input_string: str<31>) -> Self {
        Self { value: field_from_bytes(input_string.as_bytes(), true) }
    }

    pub fn to_bytes(self) -> [u8; 31] {
        self.value.to_be_bytes()
    }
}
