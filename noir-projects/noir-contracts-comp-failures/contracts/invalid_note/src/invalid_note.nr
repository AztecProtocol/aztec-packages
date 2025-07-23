use aztec::{
    macros::notes::note,
    messages::discovery::private_notes::MAX_NOTE_PACKED_LEN,
    protocol_types::{address::AztecAddress, traits::{FromField, Packable}},
};

#[note]
pub struct InvalidNote {
    pub owner: AztecAddress,
}

impl Packable for InvalidNote {
    let N: u32 = MAX_NOTE_PACKED_LEN + 1;

    fn pack(self) -> [Field; Self::N] {
        std::mem::zeroed()
    }

    fn unpack(packed: [Field; Self::N]) -> Self {
        Self { owner: AztecAddress::from_field(packed[0]) }
    }
}
