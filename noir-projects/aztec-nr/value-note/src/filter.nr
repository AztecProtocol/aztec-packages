use crate::value_note::ValueNote;
use aztec::{
    note::retrieved_note::RetrievedNote,
    protocol_types::{
        constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, utils::field::full_field_less_than,
    },
};

// DEPRECATED: Having this functionality in the value note package is incorrect and will be removed in the future.
pub fn filter_notes_min_sum(
    notes: [Option<RetrievedNote<ValueNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    min_sum: Field,
) -> [Option<RetrievedNote<ValueNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] {
    let mut selected = [Option::none(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL];

    let mut sum = 0;
    for i in 0..notes.len() {
        if notes[i].is_some() & full_field_less_than(sum, min_sum) {
            let retrieved_note = notes[i].unwrap_unchecked();
            selected[i] = Option::some(retrieved_note);
            sum += retrieved_note.note.value();
        }
    }

    selected
}
