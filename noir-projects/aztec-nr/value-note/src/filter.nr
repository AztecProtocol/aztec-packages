use crate::value_note::ValueNote;
use aztec::{
    note::retrieved_note::RetrievedNote,
    protocol_types::{
        constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, utils::field::full_field_less_than,
    },
};

pub fn filter_notes_min_sum(
    notes: BoundedVec<RetrievedNote<ValueNote>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>,
    min_sum: Field,
) -> BoundedVec<RetrievedNote<ValueNote>, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL> {
    let mut selected = BoundedVec::new();
    let mut sum = 0;

    for i in 0..MAX_NOTE_HASH_READ_REQUESTS_PER_CALL {
        if (i < notes.len()) & (full_field_less_than(sum, min_sum)) {
            let retrieved_note = notes.get_unchecked(i);
            selected.push(retrieved_note);
            sum = sum + retrieved_note.note.value();
        }
    }

    selected
}
