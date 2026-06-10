use aztec::macros::notes::{custom_note, note};

// Notes that do not implement `Packable`. Each macro must report the missing trait exactly once and
// then stop registering/generating for that note: without gating, the generated `NoteType`/`NoteHash`
// impls reference `<Self as Packable>::N` and `Packable::pack(self)`, cascading into follow-on
// missing-impl errors on top of the real diagnostic.
#[note]
pub struct NoteWithoutPackable {
    value: Field,
}

#[custom_note]
pub struct CustomNoteWithoutPackable {
    value: Field,
}
