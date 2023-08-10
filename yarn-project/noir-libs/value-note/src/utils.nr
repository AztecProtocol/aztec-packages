use dep::aztec::context::Context;
use dep::aztec::log::emit_encrypted_log;
use dep::aztec::note::note_getter_options::NoteGetterOptions;
use dep::aztec::oracle::get_public_key::get_public_key;
use dep::aztec::state_vars::set::Set;
use dep::aztec::types::point::Point;
use crate::{
    filter::get_2_notes,
    filter::get_4_notes,
    value_note::{ValueNote, VALUE_NOTE_LEN},
};
use dep::aztec::oracle::debug_log::debug_log_format;

fn spend_notes(
    context: &mut Context,
    balance: Set<ValueNote, VALUE_NOTE_LEN>,
    amount: Field,
    owner: Field,
) {
    let options = NoteGetterOptions::with_filter(get_2_notes, 0);
    let maybe_notes = balance.get_notes(context, options);

    let note0 = maybe_notes[0].unwrap_or(ValueNote::dummy());
    let note1 = maybe_notes[1].unwrap_or(ValueNote::dummy());

    // Ensure the notes are actually owned by the owner (to prevent user from generating a valid proof while
    // spending someone else's notes).
    if maybe_notes[0].is_some() {
        assert(owner == note0.owner);
        // Removes the note from the owner's set of notes.
        balance.remove(context, note0);
    }
    if maybe_notes[1].is_some() {
        assert(owner == note1.owner);
        balance.remove(context, note1);
    }

    let sum = note0.value + note1.value;
    assert(sum as u120 >= amount as u120);

    // Creates change note for the owner.
    let change_value = sum - amount;
    let mut change_note = ValueNote::new(change_value, owner);
    balance.insert(context, &mut change_note);

    // Emit the newly created encrypted note preimages via oracle calls.
    let mut encrypted_data = [0; VALUE_NOTE_LEN];
    if change_value != 0 {
        encrypted_data = change_note.serialise();
    };

    let encryption_pub_key = get_public_key(owner);
    emit_encrypted_log(
        context,
        context.inputs.call_context.storage_contract_address,
        balance.storage_slot,
        owner,
        encryption_pub_key,
        encrypted_data,
    );
}

fn spend_one_note(
    context: &mut Context,
    balance: Set<ValueNote, VALUE_NOTE_LEN>,
    amount: Field,
    owner: Field,
    note_offset: Field,
    spend_note_index: Field,
) {
    let options = NoteGetterOptions::with_filter_and_offset(get_4_notes, 0, note_offset as u32);
    let maybe_notes = balance.get_notes(context, options);

    let note0 = maybe_notes[0].unwrap_or(ValueNote::dummy());
    let note1 = maybe_notes[1].unwrap_or(ValueNote::dummy());
    let note2 = maybe_notes[2].unwrap_or(ValueNote::dummy());
    let note3 = maybe_notes[3].unwrap_or(ValueNote::dummy());

    assert(spend_note_index as u64 < 4);

    // Ensure the notes are actually owned by the owner (to prevent user from generating a valid proof while
    // spending someone else's notes).
    if maybe_notes[0].is_some() {
        assert(owner == note0.owner);
    }
    if maybe_notes[1].is_some() {
        assert(owner == note1.owner);
    }
    if maybe_notes[2].is_some() {
        assert(owner == note2.owner);
    }
    if maybe_notes[3].is_some() {
        assert(owner == note3.owner);
    }

    debug_log_format("i1: v = {0}, o = {1}", [note0.value, note0.owner]);
    debug_log_format("i2: v = {0}, o = {1}", [note1.value, note1.owner]);
    debug_log_format("i3: v = {0}, o = {1}", [note2.value, note2.owner]);
    debug_log_format("i4: v = {0}, o = {1}", [note3.value, note3.owner]);

    // Checks that the first notes is greater than or equal to the total amount being transferred.
    let mut note_value = 0;
    if spend_note_index == 0 {
        note_value = note0.value;
    } else if spend_note_index == 1 {
        note_value = note1.value;
    } else if spend_note_index == 2 {
        note_value = note2.value;
    } else {
        note_value = note3.value;
    }

    debug_log_format("spend note value {0}", [note_value]);
    
    // Assert that the note chosen to spend has enough funds.
    assert(note_value as u64 >= amount as u64);
    
    // Removes only the note that is meant to be actually spent from the owner's notes.
    if spend_note_index == 0 {
        balance.remove(context, note0);
    } else if spend_note_index == 1 {
        balance.remove(context, note1);
    } else if spend_note_index == 2 {
        balance.remove(context, note2);
    } else {
        balance.remove(context, note3);
    }
    
    // Creates change note for the owner.
    let change_value = note_value - amount;
    let mut change_note = ValueNote::new(change_value, owner);

    debug_log_format("change: v = {0}, o = {1}", [change_note.value, change_note.owner]);

    // Insert the change note to the owner's sets of notes.
    balance.insert(context, &mut change_note);

    // Emit the newly created encrypted note preimages via oracle calls.

    // Emit the newly created encrypted note preimages via oracle calls.
    let mut encrypted_data = [0; VALUE_NOTE_LEN];
    if change_value != 0 {
        encrypted_data = change_note.serialise();
    };

    let encryption_pub_key = get_public_key(owner);
    emit_encrypted_log(
        context,
        context.inputs.call_context.storage_contract_address,
        balance.storage_slot,
        owner,
        encryption_pub_key,
        encrypted_data,
    );
}

fn send_note(
    context: &mut Context,
    balance: Set<ValueNote, VALUE_NOTE_LEN>,
    amount: Field,
    recipient: Field,
) {
     // Creates new note for the recipient.
    let mut note = ValueNote::new(amount, recipient);

    // Insert the new note to the recipient's set of notes.
    balance.insert(context, &mut note);

    // Emit the newly created encrypted note preimages via oracle calls.
    let encryption_pub_key = get_public_key(recipient);
    emit_encrypted_log(
        context,
        context.inputs.call_context.storage_contract_address,
        balance.storage_slot,
        recipient,
        encryption_pub_key,
        note.serialise(),
    );
}

fn send_notes(
    context: &mut Context,
    recipient_balances: [Set<ValueNote, VALUE_NOTE_LEN>; 3],
    amounts: [Field; 3], 
    recipients: [Field; 3],
) {

    // Creates (4 - 1 = 3) new notes for the recipients.
    let mut recipient0_note = ValueNote::new(amounts[0], recipients[0]);
    let mut recipient1_note = ValueNote::new(amounts[1], recipients[1]);
    let mut recipient2_note = ValueNote::new(amounts[2], recipients[2]);

    debug_log_format("o1: v = {0}, o = {1}", [recipient0_note.value, recipient0_note.owner]);
    debug_log_format("o2: v = {0}, o = {1}", [recipient1_note.value, recipient1_note.owner]);
    debug_log_format("o3: v = {0}, o = {1}", [recipient2_note.value, recipient2_note.owner]);

    // Insert the new notes to the recipient's sets of notes.
    recipient_balances[0].insert(context, &mut recipient0_note);
    recipient_balances[1].insert(context, &mut recipient1_note);
    recipient_balances[2].insert(context, &mut recipient2_note);

    // Get recipient encryption keys.
    let recipient0_encryption_pub_key = get_public_key(recipients[0]);
    let recipient1_encryption_pub_key = get_public_key(recipients[1]);
    let recipient2_encryption_pub_key = get_public_key(recipients[2]);

    // Emit the newly created encrypted note preimages via oracle calls.
    let mut recipient0_encrypted_data = [0; VALUE_NOTE_LEN];
    if recipient0_note.value != 0 {
        recipient0_encrypted_data = recipient0_note.serialise();
    };
    emit_encrypted_log(
        context,
        context.inputs.call_context.storage_contract_address,
        recipient_balances[0].storage_slot,
        recipients[0],
        recipient0_encryption_pub_key,
        recipient0_encrypted_data,
    );

    let mut recipient1_encrypted_data = [0; VALUE_NOTE_LEN];
    if recipient1_note.value != 0 {
        recipient1_encrypted_data = recipient1_note.serialise();
    };
    emit_encrypted_log(
        context,
        context.inputs.call_context.storage_contract_address,
        recipient_balances[1].storage_slot,
        recipients[1],
        recipient1_encryption_pub_key,
        recipient1_encrypted_data,
    );

    let mut recipient2_encrypted_data = [0; VALUE_NOTE_LEN];
    if recipient2_note.value != 0 {
        recipient2_encrypted_data = recipient2_note.serialise();
    };
    emit_encrypted_log(
        context,
        context.inputs.call_context.storage_contract_address,
        recipient_balances[2].storage_slot,
        recipients[2],
        recipient2_encryption_pub_key,
        recipient2_encrypted_data,
    );
}