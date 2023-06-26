use dep::aztec::abi::MAX_READ_REQUESTS;
use dep::aztec::context::Context;
use dep::aztec::NADA;
use dep::aztec::note::note_getter_options::NoteGetterOptions;
use dep::aztec::note::note_getter_options::Sort;
use dep::aztec::note::note_getter_options::SortOrder;
use dep::aztec::state_vars::set::Set;
use crate::notes::value_note::ValueNote;
use crate::notes::value_note::VALUE_NOTE_LEN;
use crate::storage::Storage;

fn mint(mut context: Context, storage: Storage, amount: Field, recipient: Field) -> Context {
    let new_note = ValueNote::new(amount, recipient);
    let initial_balance: Set<ValueNote, VALUE_NOTE_LEN> = storage.balances.at(recipient);
    initial_balance.insert(context, new_note)
}

fn get_2_notes<P>(notes: [ValueNote; MAX_READ_REQUESTS], x: P) -> [ValueNote; 2] {
    [notes[0], notes[1]]
}

fn spend_notes(mut context: Context, storage: Storage, sender: Field, amount: Field, skip: u8) -> Field {
    let balance: Set<ValueNote, VALUE_NOTE_LEN> = storage.balances.at(sender);

    // Construct options.
    let mut options = NoteGetterOptions::new(get_2_notes, NADA);
    options = options.set_skip(skip);
    let mut sort_by = [Sort::nada(); VALUE_NOTE_LEN];
    sort_by[0] = Sort::new(1, SortOrder.DESC);
    options = options.set_sort(sort_by);

    let (new_context, notes) = balance.get_notes(context, options);
    context = new_context;

    let mut sum = 0;
    for i in 0..notes.len() {
        sum += notes[i].value;
    };
    assert(sum != 0);

    // Destroy all notes.
    for i in 0..notes.len() {
        if (notes[i].is_real) {
            context = balance.remove(context, notes[i]);
        };
    };

    if (sum as u254 > amount as u254) {
        // Add change note.
        let change = sum - amount;
        let change_note = ValueNote::new(change, sender);
        context = balance.insert(context, change_note);
    } else {
        // TODO: private function call
        spend_notes(context, storage, sender, amount - sum, skip + 2);
    }

    amount
}

fn transfer(mut context: Context, storage: Storage, sender: Field, amount: Field, recipient: Field) -> Context {
    let balance: Set<ValueNote, VALUE_NOTE_LEN> = storage.balances.at(sender);

    // Destroy notes to get the required value.
    let spent_value = spend_notes(context, storage, sender, amount, 0);
    assert(spent_value == amount);

    // Create new note for recipient.
    let new_note = ValueNote::new(amount, recipient);
    let recipient_balance: Set<ValueNote, VALUE_NOTE_LEN> = storage.balances.at(recipient);
    recipient_balance.insert(context, new_note)
}