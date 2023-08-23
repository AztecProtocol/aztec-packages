use dep::std::option::Option;
use dep::aztec::context::PrivateContext;
use dep::aztec::log::emit_encrypted_log;
use dep::aztec::note::note_getter_options::{NoteGetterOptions, SortOrder};
use dep::aztec::oracle::get_public_key::get_public_key;
use dep::aztec::state_vars::set::Set;
use crate::{
    filter::filter_notes_min_sum,
    value_note::{ValueNote, VALUE_NOTE_LEN},
};

// Sort the note values (0th field) in descending order.
// Pick the fewest notes whose sum is equal to or greater than `amount`.
fn create_note_getter_options_for_decreasing_balance(amount: Field) -> NoteGetterOptions<ValueNote, VALUE_NOTE_LEN, Field> {
    NoteGetterOptions::with_filter(filter_notes_min_sum, amount).sort(0, SortOrder.DESC)
}

// Creates a new note for the recipient.
// Inserts it to the recipient's balance.
fn increase_balance(
    context: &mut PrivateContext,
    balance: Set<ValueNote, VALUE_NOTE_LEN>,
    amount: Field,
    recipient: Field,
) {
    let mut note = ValueNote::new(amount, recipient);
    create_note(context, balance, recipient, &mut note);

    // It won't compile if Set.insert() is in an if statement :(
    // if amount as u120 > 0 {
    //     create_note(context, balance, recipient, &mut note);
    // }
}

// Find some notes that add up to the amount.
// Removes those note from owner's balance.
// Fail if the sum of the selected notes is less than the amount.
fn decrease_balance(
    context: &mut PrivateContext,
    balance: Set<ValueNote, VALUE_NOTE_LEN>,
    amount: Field,
    owner: Field,
) {
    let sum = decrease_balance_max_amount(context, balance, amount, owner);
    assert(sum == amount);
}

// Similar to `decrease_balance`, except that it doesn't fail if the subtracted amount is less than max_amount.
// It returns the subtracted value, which should be less than or equal to max_amount.
fn decrease_balance_max_amount(
    context: &mut PrivateContext,
    balance: Set<ValueNote, VALUE_NOTE_LEN>,
    max_amount: Field,
    owner: Field,
) -> Field {
    let options = create_note_getter_options_for_decreasing_balance(max_amount);
    let opt_notes = balance.get_notes(context, options);

    let mut subtracted = 0;
    for i in 0..opt_notes.len() {
        if opt_notes[i].is_some() {
            subtracted += destroy_note(context, balance, owner, opt_notes[i].unwrap_unchecked());
        }
    }

    // Add the change value back to the owner's balance.
    let mut change_value = 0;
    if subtracted as u120 > max_amount as u120 {
        change_value = subtracted - max_amount;
        subtracted -= change_value;
    }
    increase_balance(context, balance, change_value, owner);

    subtracted
}

fn create_note(
    context: &mut PrivateContext,
    balance: Set<ValueNote, VALUE_NOTE_LEN>,
    owner: Field,
    note: &mut ValueNote,
) {
    // Insert the new note to the owner's set of notes.
    balance.insert(context, note);

    // Remove this if statement if we can wrap this create_note function in an if statement.
    if note.value != 0 {
        // Emit the newly created encrypted note preimages via oracle calls.
        // docs:start:encrypted
        let application_contract_address = (*context).this_address();
        let note_storage_slot = balance.storage_slot;
        let encryption_pub_key = get_public_key(owner);
        let encrypted_data = (*note).serialise();

        emit_encrypted_log(
            context,
            application_contract_address,
            note_storage_slot,
            encryption_pub_key,
            encrypted_data,
        );
        // docs:end:encrypted
    }
}

// Removes the note from the owner's set of notes.
// Returns the value of the destroyed note.
fn destroy_note(
    context: &mut PrivateContext,
    balance: Set<ValueNote, VALUE_NOTE_LEN>,
    owner: Field,
    note: ValueNote,
) -> Field {
    // Ensure the note is actually owned by the owner (to prevent user from generating a valid proof while
    // spending someone else's notes).
    assert(note.owner == owner);

    balance.remove(context, note);
    
    note.value
}
