use crate::context::private_context::PrivateContext;
use protocol_types::address::aztec_address::AztecAddress;

pub fn compute_and_emit_partial_note_private_log<let PLAINTEXT_LEN: u32>(
    context: &mut PrivateContext,
    recipient: AztecAddress,
    sender: AztecAddress,
    log_plaintext: [u8; PLAINTEXT_LEN],
) {
    // let magic_tag: Field = 42424242;
    // let magic_tag_encoded: [u8; 32] = magic_tag.to_be_bytes();

    let mut mutated_plaintext: [u8; PLAINTEXT_LEN + 32] = std::mem::zeroed();

    for i in 0..log_plaintext.len() {
        mutated_plaintext[i] = log_plaintext[i];
    }
    // for i in 0..32 {
    //     mutated_plaintext[i] = log_plaintext[i];
    //     mutated_plaintext[i + 32] = log_plaintext[i + 32];
    // }
    mutated_plaintext[32 + 31] = log_plaintext[32 + 31] + 128;

    /// Safety: lol
    let contract_address = unsafe { crate::oracle::execution::get_contract_address() };

    let payload = super::payload::compute_private_log_payload(
        contract_address,
        recipient,
        sender,
        mutated_plaintext,
    );
    context.emit_private_log(payload);
}
