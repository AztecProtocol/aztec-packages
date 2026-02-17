use aztec::{
    macros::notes::note,
    messages::logs::note::MAX_NOTE_PACKED_LEN,
    protocol::traits::Packable,
};

#[note]
pub struct InvalidNote {
}

impl Packable for InvalidNote {
    let N: u32 = MAX_NOTE_PACKED_LEN + 1;

    fn pack(self) -> [Field; Self::N] {
        std::mem::zeroed()
    }

    fn unpack(_packed: [Field; Self::N]) -> Self {
        Self {}
    }
}
