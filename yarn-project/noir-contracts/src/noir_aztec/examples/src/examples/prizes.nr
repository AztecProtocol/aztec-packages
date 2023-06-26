use dep::aztec::abi::MAX_READ_REQUESTS;
use dep::aztec::context::Context;
use dep::aztec::note::note_getter_options::NoteGetterOptions;
use crate::notes::prize_note::PrizeNote;
use crate::notes::prize_note::PRIZE_NOTE_LEN;
use crate::storage::Storage;

fn add_prize(mut context: Context, storage: Storage, id: Field, value: Field) -> Context {
    let new_note = PrizeNote::new(id, value);
    storage.prizes.insert(context, new_note)
}

fn pick_prize(notes: [PrizeNote; MAX_READ_REQUESTS], value: Field) -> [PrizeNote; 1] {
    let mut note = PrizeNote::dummy();
    for i in 0..notes.len() {
        if (notes[i].value as u254 > note.value as u254 & notes[i].value as u254 <= value as u254) {
            note = notes[i];
        };
    };
    [note]
}

fn claim_prize(mut context: Context, storage: Storage, value: Field) -> Context {
    let options = NoteGetterOptions::new(pick_prize, value);
    let (new_context, notes) = storage.prizes.get_notes(context, options);
    context = new_context;
    let prize: PrizeNote = notes[0];
    assert(!prize.is_dummy());
    storage.prizes.remove(context, prize)
}