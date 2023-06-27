use dep::aztec::context::Context;
use dep::aztec::log::emit::emit_encrypted_log;

fn encrypt_and_emit<S>(
    mut context: Context,
    contract_address: Field,
    storage_slot: Field,
    preimage: [Field; S],
) -> Context {
    // TODO: Encrypt.
    let log = preimage;
    let preimage_length = preimage.len();
    emit_encrypted_log(context, log, preimage_length)
}