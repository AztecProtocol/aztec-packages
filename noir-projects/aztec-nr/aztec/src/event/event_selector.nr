use dep::protocol_types::{
    hash::poseidon2_hash_bytes,
    traits::{Deserialize, Empty, FromField, Serialize, ToField},
};

#[derive(Deserialize, Eq, Serialize)]
pub struct EventSelector {
    // 1st 4-bytes (big-endian leftmost) of abi-encoding of an event.
    inner: u32,
}

impl FromField for EventSelector {
    fn from_field(field: Field) -> Self {
        Self { inner: field as u32 }
    }
}

impl ToField for EventSelector {
    fn to_field(self) -> Field {
        self.inner as Field
    }
}

impl Empty for EventSelector {
    fn empty() -> Self {
        Self { inner: 0 as u32 }
    }
}

impl EventSelector {
    pub fn from_u32(value: u32) -> Self {
        Self { inner: value }
    }

    pub fn from_signature<let N: u32>(signature: str<N>) -> Self {
        let bytes = signature.as_bytes();
        let hash = poseidon2_hash_bytes(bytes);

        // `hash` is automatically truncated to fit within 32 bits.
        EventSelector::from_field(hash)
    }

    pub fn zero() -> Self {
        Self { inner: 0 }
    }
}
