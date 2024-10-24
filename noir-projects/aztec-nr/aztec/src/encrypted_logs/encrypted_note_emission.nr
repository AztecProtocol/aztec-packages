use crate::{
    context::PrivateContext, note::{note_emission::NoteEmission, note_interface::NoteInterface},
    keys::getters::get_ovsk_app, encrypted_logs::payload::compute_encrypted_log,
};
use dep::protocol_types::{
    address::AztecAddress, public_keys::{PublicKeys, OvpkM, IvpkM}, hash::sha256_to_field,
    abis::note_hash::NoteHash,
};

fn compute_raw_note_log<Note, let N: u32>(
    context: PrivateContext,
    note: Note,
    ovsk_app: Field,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress,
) -> (u32, [u8; 416 + N * 32], Field)
where
    Note: NoteInterface<N>,
{
    let note_header = note.get_header();
    let note_hash_counter = note_header.note_hash_counter;
    let storage_slot = note_header.storage_slot;

    // TODO(#8589): use typesystem to skip this check when not needed
    let note_exists = context.note_hashes.storage.any(|n: NoteHash| n.counter == note_hash_counter);
    assert(note_exists, "Can only emit a note log for an existing note.");

    let contract_address: AztecAddress = context.this_address();

    let plaintext = note.to_be_bytes(storage_slot);
    let encrypted_log: [u8; 416 + N * 32] =
        compute_encrypted_log(contract_address, ovsk_app, ovpk, recipient, plaintext);
    let log_hash = sha256_to_field(encrypted_log);

    (note_hash_counter, encrypted_log, log_hash)
}

unconstrained fn compute_raw_note_log_unconstrained<Note, let N: u32>(
    context: PrivateContext,
    note: Note,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress,
) -> (u32, [u8; 416 + N * 32], Field)
where
    Note: NoteInterface<N>,
{
    let ovsk_app = get_ovsk_app(ovpk.hash());
    compute_raw_note_log(context, note, ovsk_app, ovpk, ivpk, recipient)
}

// This function seems to be affected by the following Noir bug:
// https://github.com/noir-lang/noir/issues/5771
// If you get weird behavior it might be because of it.
pub fn encode_and_encrypt_note<Note, let N: u32>(
    context: &mut PrivateContext,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress,
) -> fn[(&mut PrivateContext, OvpkM, IvpkM, AztecAddress)](NoteEmission<Note>) -> ()
where
    Note: NoteInterface<N>,
{
    |e: NoteEmission<Note>| {
        let ovsk_app: Field = context.request_ovsk_app(ovpk.hash());

        let (note_hash_counter, encrypted_log, log_hash) =
            compute_raw_note_log(*context, e.note, ovsk_app, ovpk, ivpk, recipient);
        context.emit_raw_note_log(note_hash_counter, encrypted_log, log_hash);
    }
}

pub fn encode_and_encrypt_note_unconstrained<Note, let N: u32>(
    context: &mut PrivateContext,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress,
) -> fn[(&mut PrivateContext, OvpkM, IvpkM, AztecAddress)](NoteEmission<Note>) -> ()
where
    Note: NoteInterface<N>,
{
    |e: NoteEmission<Note>| {
        //   Having the log hash be unconstrained here is fine because the way this works is we send the log hash
        // to the kernel, and it gets included as part of its public inputs. Then we send the tx to the sequencer,
        // which includes the kernel proof and the log preimages. The sequencer computes the hashes of the logs
        // and checks that they are the ones in the public inputs of the kernel, and drops the tx otherwise (proposing
        // the block on L1 would later fail if it didn't because of txs effects hash mismatch).
        //   So if we don't constrain the log hash, then a malicious sender can compute the correct log, submit a bad
        // log hash to the kernel, and then submit the bad log preimage to the sequencer. All checks will pass, but
        // the submitted log will not be the one that was computed by the app.
        //   In the unconstrained case, we don't care about the log at all because we don't do anything with it,
        // and because it's unconstrained: it could be anything. So if a sender chooses to broadcast the tx with a log
        // that is different from the one that was used in the circuit, then they'll be able to, but they were already
        // able to change the log before anyway, so the end result is the same. It's important here that we do not
        // return the log from this function to the app, otherwise it could try to do stuff with it and then that might
        // be wrong.
        //   Regarding the note hash counter, this is used for squashing. The kernel assumes that a given note can have
        // more than one log and removes all of the matching ones, so all a malicious sender could do is either: cause
        // for the log to be deleted when it shouldn't have (which is fine - they can already make the content be
        // whatever), or cause for the log to not be deleted when it should have (which is also fine - it'll be a log
        // for a note that doesn't exist).
        let (note_hash_counter, encrypted_log, log_hash) =
            unsafe { compute_raw_note_log_unconstrained(*context, e.note, ovpk, ivpk, recipient) };
        context.emit_raw_note_log(note_hash_counter, encrypted_log, log_hash);
    }
}

/// Encrypts a partial log and emits it. Takes recipient keys on the input and encrypts both the outgoing and incoming
/// logs for the recipient. This is necessary because in the partial notes flow the outgoing always has to be the same
/// as the incoming to not leak any information (typically the `from` party finalizing the partial note in public does
/// not know who the recipient is).
pub fn encrypt_and_emit_partial_log<let M: u32>(
    context: &mut PrivateContext,
    log_plaintext: [u8; M],
    recipient_keys: PublicKeys,
    recipient: AztecAddress,
) {
    let ovsk_app: Field = context.request_ovsk_app(recipient_keys.ovpk_m.hash());

    let encrypted_log: [u8; 352 + M] = compute_encrypted_log(
        context.this_address(),
        ovsk_app,
        recipient_keys.ovpk_m,
        recipient,
        log_plaintext,
    );
    let log_hash = sha256_to_field(encrypted_log);

    // Unfortunately we need to push a dummy note hash to the context here because a note log requires having
    // a counter that corresponds to a note hash in the same call.
    let note_hash_counter = context.side_effect_counter;
    context.push_note_hash(5);

    context.emit_raw_note_log(note_hash_counter, encrypted_log, log_hash);
}
