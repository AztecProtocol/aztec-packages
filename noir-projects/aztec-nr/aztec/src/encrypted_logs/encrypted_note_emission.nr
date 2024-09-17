use crate::{
    context::PrivateContext, note::{note_emission::NoteEmission, note_interface::NoteInterface},
    keys::{getters::{get_current_public_keys, get_ovsk_app}, public_keys::{OvpkM, IvpkM}},
    encrypted_logs::payload::compute_encrypted_note_log, oracle::logs_traits::LensForEncryptedLog
};
use dep::protocol_types::{hash::sha256_to_field, address::AztecAddress, abis::note_hash::NoteHash};

fn compute_raw_note_log<Note, let N: u32, let NB: u32, let M: u32>(
    context: PrivateContext,
    note: Note,
    ovsk_app: Field,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress
) -> (u32, [u8; M], Field) where Note: NoteInterface<N, NB>, [Field; N]: LensForEncryptedLog<N, M> {
    let note_header = note.get_header();
    let note_hash_counter = note_header.note_hash_counter;
    let storage_slot = note_header.storage_slot;

    // TODO(#8589): use typesystem to skip this check when not needed
    let note_exists = context.note_hashes.storage.any(|n: NoteHash| n.counter == note_hash_counter);
    assert(note_exists, "Can only emit a note log for an existing note.");

    let contract_address: AztecAddress = context.this_address();

    // Number of publicly delivered values is always 0 here because `compute(...)` is only called
    // in the non-partial note flow.
    let num_public_values = 0;
    let encrypted_log: [u8; M] = compute_encrypted_note_log(
        contract_address,
        storage_slot,
        ovsk_app,
        ovpk,
        ivpk,
        recipient,
        note,
        num_public_values
    );
    let log_hash = sha256_to_field(encrypted_log);

    (note_hash_counter, encrypted_log, log_hash)
}

unconstrained fn compute_raw_note_log_unconstrained<Note, let N: u32, let NB: u32, let M: u32>(
    context: PrivateContext,
    note: Note,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress
) -> (u32, [u8; M], Field) where Note: NoteInterface<N, NB>, [Field; N]: LensForEncryptedLog<N, M> {
    let ovsk_app = get_ovsk_app(ovpk.hash());
    compute_raw_note_log(context, note, ovsk_app, ovpk, ivpk, recipient)
}

pub fn encode_and_encrypt_note<Note, let N: u32, let NB: u32, let M: u32>(
    context: &mut PrivateContext,
    ov: AztecAddress,
    iv: AztecAddress
) -> fn[(&mut PrivateContext, AztecAddress, AztecAddress)](NoteEmission<Note>) -> () where Note: NoteInterface<N, NB>, [Field; N]: LensForEncryptedLog<N, M> {
    | e: NoteEmission<Note> | {
        let ovpk = get_current_public_keys(context, ov).ovpk_m;
        let ivpk = get_current_public_keys(context, iv).ivpk_m;
        let ovsk_app: Field  = context.request_ovsk_app(ovpk.hash());

        let (note_hash_counter, encrypted_log, log_hash) = compute_raw_note_log(*context, e.note, ovsk_app, ovpk, ivpk, iv);
        context.emit_raw_note_log(note_hash_counter, encrypted_log, log_hash);
    }
}

pub fn encode_and_encrypt_note_unconstrained<Note, let N: u32, let NB: u32, let M: u32>(
    context: &mut PrivateContext,
    ov: AztecAddress,
    iv: AztecAddress
) -> fn[(&mut PrivateContext, AztecAddress, AztecAddress)](NoteEmission<Note>) -> () where Note: NoteInterface<N, NB>, [Field; N]: LensForEncryptedLog<N, M> {
    | e: NoteEmission<Note> | {
        // Note: We could save a lot of gates by obtaining the following keys in an unconstrained context but this
        // function is currently not used anywhere so we are not optimizing it.
        let ovpk = get_current_public_keys(context, ov).ovpk_m;
        let ivpk = get_current_public_keys(context, iv).ivpk_m;

        // See the comment in `encode_and_encrypt_note_with_keys_unconstrained` for why having note hash counter
        // and log hash unconstrained here is fine.
        let (note_hash_counter, encrypted_log, log_hash) = unsafe {
            compute_raw_note_log_unconstrained(*context, e.note, ovpk, ivpk, iv)
        };
        context.emit_raw_note_log(note_hash_counter, encrypted_log, log_hash);
    }
}

pub fn encode_and_encrypt_note_with_keys<Note, let N: u32, let NB: u32, let M: u32>(
    context: &mut PrivateContext,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress
) -> fn[(&mut PrivateContext, OvpkM, IvpkM, AztecAddress)](NoteEmission<Note>) -> () where Note: NoteInterface<N, NB>, [Field; N]: LensForEncryptedLog<N, M> {
    | e: NoteEmission<Note> | {
        let ovsk_app: Field  = context.request_ovsk_app(ovpk.hash());

        let (note_hash_counter, encrypted_log, log_hash) = compute_raw_note_log(*context, e.note, ovsk_app, ovpk, ivpk, recipient);
        context.emit_raw_note_log(note_hash_counter, encrypted_log, log_hash);
    }
}

pub fn encode_and_encrypt_note_with_keys_unconstrained<Note, let N: u32, let NB: u32, let M: u32>(
    context: &mut PrivateContext,
    ovpk: OvpkM,
    ivpk: IvpkM,
    recipient: AztecAddress
) -> fn[(&mut PrivateContext, OvpkM, IvpkM, AztecAddress)](NoteEmission<Note>) -> () where Note: NoteInterface<N, NB>, [Field; N]: LensForEncryptedLog<N, M> {
    | e: NoteEmission<Note> | {
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
        let (note_hash_counter, encrypted_log, log_hash) = unsafe {
            compute_raw_note_log_unconstrained(*context, e.note, ovpk, ivpk, recipient)
        };
        context.emit_raw_note_log(note_hash_counter, encrypted_log, log_hash);
    }
}
