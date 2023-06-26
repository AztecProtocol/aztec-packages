use crate::context::Context;
use crate::note::note_interface::NoteInterface;
use crate::oracle;

fn encrypt_and_emit<Note, N>(
    mut context: Context,
    contract_address: Field,
    storage_slot: Field,
    account: Field,
    note_interface: NoteInterface<Note, N>,
    note: Note,
) -> Context {
    let serialise = note_interface.serialise;
    let preimage = serialise(note);
    let (hash, len) = oracle::encrypt(account, contract_address, storage_slot, preimage);
    context = context.set_encrypted_logs_hash(hash);
    context = context.set_encrypted_log_preimages_length(len);
    context
}