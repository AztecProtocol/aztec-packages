use dep::aztec::state_vars::{
    immutable_singleton::ImmutableSingleton,
    map::Map,
    set::Set
};
use crate::point_note::{
    PointNote,
    PointNoteInterface,
    POINT_NOTE_LEN,
};
use dep::value_note::value_note::{
    ValueNote,
    ValueNoteInterface,
    VALUE_NOTE_LEN,
};

struct Storage {
    sender: ImmutableSingleton<PointNote, POINT_NOTE_LEN>,
    recipient: ImmutableSingleton<PointNote, POINT_NOTE_LEN>,
    balances: Map<Set<ValueNote, VALUE_NOTE_LEN>>,
}

impl Storage {
    fn init() -> Self {
        Storage {
            sender: ImmutableSingleton::new(1, PointNoteInterface),
            recipient: ImmutableSingleton::new(2, PointNoteInterface),
            balances: Map::new(1, |s| Set::new(s, ValueNoteInterface)),
        }
    }
}