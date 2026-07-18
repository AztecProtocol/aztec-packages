use aztec::{
    macros::notes::note,
    note::note_getter_options::PropertySelector,
    protocol::traits::{Deserialize, Packable, Serialize},
};

/// A note that packs two u8 fields (high, low) into a single Field.
/// The layout in the packed Field is: (high << 8) + low.
/// This means in the big-endian 32-byte representation:
///   - low occupies offset=0, length=1 (the least significant byte)
///   - high occupies offset=1, length=1 (the second least significant byte)
#[derive(Deserialize, Eq, Serialize)]
#[note]
pub struct PackedNote {
    pub high: u8,
    pub low: u8,
}

impl Packable for PackedNote {
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

impl PackedNote {
    pub fn high_selector() -> PropertySelector<u8> {
        PropertySelector { index: 0, offset: 1, length: 1 }
    }

    pub fn low_selector() -> PropertySelector<u8> {
        PropertySelector { index: 0, offset: 0, length: 1 }
    }
}

mod test {
    use super::{Packable, PackedNote};
    use aztec::{
        note::{note_getter_options::{NoteGetterOptions, SortOrder}, note_interface::NoteProperties},
        utils::comparison::Comparator,
    };

    #[test(should_fail_with = "PackedNote's auto-generated note properties assume the #[derive(Packable)] layout (2 fields), but its hand-written Packable packs to 1. Derive Packable, or define property selectors manually for the custom layout. See https://docs.aztec.network/errors/15")]
    fn generated_properties_rejected_for_custom_packing() {
        let _ = PackedNote::properties();
    }

    #[test]
    fn manual_selectors_work_with_custom_packing() {
        let mut options: NoteGetterOptions<PackedNote, <PackedNote as Packable>::N, Field, Field> =
            NoteGetterOptions::new();
        let options = options.select(PackedNote::high_selector(), Comparator.EQ, 7).sort(
            PackedNote::low_selector(),
            SortOrder.ASC,
        );
        assert_eq(options.selects.len(), 1);
        assert_eq(options.sorts.len(), 1);
    }

    #[test]
    fn test_pack_unpack() {
        let note = PackedNote { high: 42, low: 7 };
        let unpacked = PackedNote::unpack(note.pack());
        assert_eq(unpacked.high, 42);
        assert_eq(unpacked.low, 7);
    }

    #[test]
    fn test_pack_unpack_max() {
        let note = PackedNote { high: 255, low: 255 };
        let unpacked = PackedNote::unpack(note.pack());
        assert_eq(unpacked.high, 255);
        assert_eq(unpacked.low, 255);
    }
}
