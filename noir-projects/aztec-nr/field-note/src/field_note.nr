use aztec::{
    macros::notes::note,
    note::{note_getter_options::PropertySelector, note_interface::NoteProperties},
    protocol::traits::{Deserialize, Packable, Serialize},
};

#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct FieldNote {
    pub value: Field,
}

#[derive(Deserialize, Eq, Serialize)]
#[note]
struct PackedSelectorNote {
    pub high: u8,
    pub low: u8,
}

impl Packable for PackedSelectorNote {
    let N: u32 = 1;

    fn pack(self) -> [Field; Self::N] {
        [(self.high as Field) * 256 + (self.low as Field)]
    }

    fn unpack(packed: [Field; Self::N]) -> Self {
        let low = packed[0] as u8;
        let high = ((packed[0] - low as Field) / 256) as u8;
        Self { high, low }
    }
}

#[test]
fn generated_note_properties_match_custom_packed_layout() {
    let props = PackedSelectorNote::properties();

    assert_eq(props.high.index, 0);
    assert_eq(props.high.offset, 1);
    assert_eq(props.high.length, 1);

    assert_eq(props.low.index, 0);
    assert_eq(props.low.offset, 0);
    assert_eq(props.low.length, 1);
}
