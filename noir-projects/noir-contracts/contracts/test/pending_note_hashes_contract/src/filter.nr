// docs:start:custom_filter_imports
use aztec::{
    note::HintedNote,
    protocol::{constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, utils::field::full_field_less_than},
};
// docs:end:custom_filter_imports
use field_note::FieldNote;

// docs:start:custom_filter
pub fn filter_notes_min_sum(
    notes: [Option<HintedNote<FieldNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL],
    min_sum: Field,
) -> [Option<HintedNote<FieldNote>>; MAX_NOTE_HASH_READ_REQUESTS_PER_CALL] {
    let mut selected = [Option::none(); MAX_NOTE_HASH_READ_REQUESTS_PER_CALL];

    let mut sum = 0;
    for i in 0..notes.len() {
        if notes[i].is_some() & full_field_less_than(sum, min_sum) {
            let hinted_note = notes[i].unwrap_unchecked();
            selected[i] = Option::some(hinted_note);
            sum += hinted_note.note.value;
        }
    }

    selected
}
// docs:end:custom_filter
