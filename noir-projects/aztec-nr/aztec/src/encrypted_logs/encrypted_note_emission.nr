use crate::{
    context::PrivateContext,
    encrypted_logs::payload::compute_private_log_payload,
    note::{note_emission::NoteEmission, note_interface::NoteInterface},
};
use dep::protocol_types::{
    abis::note_hash::NoteHash, address::AztecAddress, constants::PRIVATE_LOG_SIZE_IN_FIELDS,
};

/// Computes private note log payload
fn compute_payload<Note, let N: u32>(
    context: PrivateContext,
    note: Note,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> ([Field; PRIVATE_LOG_SIZE_IN_FIELDS], u32)
where
    Note: NoteInterface<N>,
{
    let note_header = note.get_header();
    let note_hash_counter = note_header.note_hash_counter;
    let storage_slot = note_header.storage_slot;

    // TODO(#8589): use typesystem to skip this check when not needed
    let note_exists =
        context.note_hashes.storage().any(|n: NoteHash| n.counter == note_hash_counter);
    assert(note_exists, "Can only emit a note log for an existing note.");

    let contract_address: AztecAddress = context.this_address();

    let plaintext = note.to_be_bytes(storage_slot);

    let payload = compute_private_log_payload(contract_address, recipient, sender, plaintext);

    (payload, note_hash_counter)
}

unconstrained fn compute_payload_unconstrained<Note, let N: u32>(
    context: PrivateContext,
    note: Note,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> ([Field; PRIVATE_LOG_SIZE_IN_FIELDS], u32)
where
    Note: NoteInterface<N>,
{
    compute_payload(context, note, recipient, sender)
}

pub fn encode_and_encrypt_note<Note, let N: u32>(
    context: &mut PrivateContext,
    recipient: AztecAddress,
    // We need this because to compute a tagging secret, we require a sender:
    sender: AztecAddress,
) -> fn[(&mut PrivateContext, AztecAddress, AztecAddress)](NoteEmission<Note>) -> ()
where
    Note: NoteInterface<N>,
{
    |e: NoteEmission<Note>| {
        let (encrypted_log, note_hash_counter) =
            compute_payload(*context, e.note, recipient, sender);
        context.emit_raw_note_log(encrypted_log, note_hash_counter);
    }
}

pub fn encode_and_encrypt_note_unconstrained<Note, let N: u32>(
    context: &mut PrivateContext,
    recipient: AztecAddress,
    // We need this because to compute a tagging secret, we require a sender:
    sender: AztecAddress,
) -> fn[(&mut PrivateContext, AztecAddress, AztecAddress)](NoteEmission<Note>) -> ()
where
    Note: NoteInterface<N>,
{
    |e: NoteEmission<Note>| {
        //   Unconstrained logs have both their content and encryption unconstrained - it could occur that the
        // recipient is unable to decrypt the payload.
        //   Regarding the note hash counter, this is used for squashing. The kernel assumes that a given note can have
        // more than one log and removes all of the matching ones, so all a malicious sender could do is either: cause
        // for the log to be deleted when it shouldn't have (which is fine - they can already make the content be
        // whatever), or cause for the log to not be deleted when it should have (which is also fine - it'll be a log
        // for a note that doesn't exist).
        //   It's important here that we do not
        // return the log from this function to the app, otherwise it could try to do stuff with it and then that might
        // be wrong.
        let (encrypted_log, note_hash_counter) =
            unsafe { compute_payload_unconstrained(*context, e.note, recipient, sender) };
        context.emit_raw_note_log(encrypted_log, note_hash_counter);
    }
}
