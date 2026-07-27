use aztec::{macros::notes::note, protocol::traits::{Deserialize, Packable, Serialize}};

#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct FieldPair {
    a: Field,
    b: Field,
}

/// A note whose first two fields occupy more than one slot each in the packed representation: `pair` packs to two
/// fields and `values` to three, so `tag` lives at packed index 5.
#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct MultiSlotNote {
    pair: FieldPair,
    values: [Field; 3],
    tag: Field,
}

mod test {
    use super::{FieldPair, MultiSlotNote};
    use aztec::{
        note::{note_getter_options::{NoteGetterOptions, SortOrder}, note_interface::NoteProperties},
        protocol::traits::Packable,
        utils::comparison::Comparator,
    };

    #[test]
    fn selector_indices_match_packed_layout() {
        let props = MultiSlotNote::properties();
        assert_eq(props.pair.index, 0);
        assert_eq(props.values.index, 2);
        assert_eq(props.tag.index, 5);
    }

    #[test]
    fn tag_selector_points_at_tag_slot() {
        let note = MultiSlotNote { pair: FieldPair { a: 11, b: 22 }, values: [33, 44, 55], tag: 66 };
        let packed = note.pack();
        assert_eq(packed[MultiSlotNote::properties().tag.index as u32], note.tag);
    }

    #[test]
    fn can_select_and_sort_by_single_slot_property() {
        let mut options: NoteGetterOptions<MultiSlotNote, <MultiSlotNote as Packable>::N, Field, Field> =
            NoteGetterOptions::new();
        let options = options.select(MultiSlotNote::properties().tag, Comparator.EQ, 7).sort(
            MultiSlotNote::properties().tag,
            SortOrder.ASC,
        );
        assert_eq(options.selects.len(), 1);
        assert_eq(options.sorts.len(), 1);
    }

    #[test(should_fail_with = "cannot select by a property that packs to more than one field")]
    fn cannot_select_by_multi_slot_property() {
        let mut options: NoteGetterOptions<MultiSlotNote, <MultiSlotNote as Packable>::N, Field, Field> =
            NoteGetterOptions::new();
        let _ = options.select(MultiSlotNote::properties().pair, Comparator.EQ, FieldPair { a: 0, b: 0 });
    }

    #[test(should_fail_with = "cannot sort by a property that packs to more than one field")]
    fn cannot_sort_by_multi_slot_property() {
        let mut options: NoteGetterOptions<MultiSlotNote, <MultiSlotNote as Packable>::N, Field, Field> =
            NoteGetterOptions::new();
        let _ = options.sort(MultiSlotNote::properties().pair, SortOrder.ASC);
    }
}
