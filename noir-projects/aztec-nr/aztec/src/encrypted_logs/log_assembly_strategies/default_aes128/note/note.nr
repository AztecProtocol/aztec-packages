use crate::{
    context::PrivateContext,
    encrypted_logs::log_assembly_strategies::default_aes128::note::encryption::encrypt_log,
    note::{note_emission::NoteEmission, note_interface::NoteType},
};
use dep::protocol_types::{
    abis::note_hash::NoteHash, address::AztecAddress, constants::PRIVATE_LOG_SIZE_IN_FIELDS,
    traits::Packable,
};

/*
 * WHY IS THERE LOTS OF CODE DUPLICATION BETWEEN event.nr and note.nr?
 * It's because there are a few more optimisations that can be done for notes,
 * and so the stuff that looks like duplicated code currently, won't be
 * the same for long.
 * To modularise now feels premature, because we might get that modularisation wrong.
 * Much better (imo) to have a flattened templates for log assembly, because it
 * makes it much easier for us all to follow, it serves as a nice example for the
 * community to follow (if they wish to roll their own log layouts), and it gives
 * us more time to spot common patterns across all kinds of log layouts.
 */

/*
 * LOG CONFIGURATION CHOICES:
 *
 * deliver_to: INPUT as recipient: AztecAddress
 * encrypt_with: aes128 CBC (Cipher Block Chaining)
 * shared_secret: ephemeral
 * shared_secret_randomness_extraction_hash: sha256
 * tag: true
 * tag_from: INPUT as sender: AztecAddress
 *
 * Note-specific:
 * derive_note_randomness_from_shared_secret: false
 *
 */

/*
 * LOG LAYOUT CHOICE:
 *
 * Short explanation:
 * log = [tag, epk, header_ct=[[contract_address, ct_len], pkcs7_pad], ct=[[pt], pkcs7_pad], some bytes padding, some fields padding]
 *
 * Long explanation:
 * tag: Field
 * epk: [Field, u8]
 * header_ct: [[u8; 32], [u8; 2], [u8; 16]]
 * ct: [[u8; 2], [u8; x], [u8; y]]
 *
 * More precisely (in pseudocode):
 *
 * log = [
 *     tag: Field,
 *     Epk: Field,
 *
 *     le_bytes_31_to_fields(
 *
 *         log_bytes: [
 *             eph_pk_sign: [u8; 1],
 *
 *             header_ciphertext: aes_encrypt(
 *                 contract_address: [u8; 32],
 *                 ct_length: [u8; 2],
 *
 *                 // the aes128_encrypt fn automatically inserts padding:
 *                 header_pt_aes_padding: [u8; 14], // `16 - (input.len() % 16)`

 *             ): [u8; 48],
 *
 *             ciphertext: aes_encrypt(
 *                 final_pt: [
 *                     pt: {
 *                         note_bytes: {
 *                             storage_slot: [u8; 32],
 *                             note_type_id: [u8; 32],
 *                             ...note: [u8; N * 32],
 *                         }: [u8; N * 32 + 64],
 *                     }: [u8; N * 32 + 64],

 *                 ]: [u8; N * 32 + 64],
 *
 *                 // the aes128_encrypt fn automatically inserts padding:
 *                 pt_aes_padding: [u8; 16 - ( (|pt_length| + |pt|) % 16 )]
 *
 *             ): [u8; |pt| + |pt_aes_padding|]
 *                [u8; |ct|]
 *
 *             log_bytes_padding_to_mult_31: [u8; 31 * ceil((1 + 48 + |ct|)/31) - (1 + 48 + |ct|)],
 *                                           [u8; p]
 *
 *         ]: [u8; 1 + 48 + |ct| + p]
 *
 *     ): [Field; (1 + 48 + |ct| + p) / 31]
 *
 *     log_fields_padding: [Field; PRIVATE_LOG_SIZE_IN_FIELDS - 2 - (1 + 48 + |ct| + p) / 31],
 *
 * ]: [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
 *
 *
 */

/********************************************************/
// End of disgusting arithmetic on generics
/********************************************************/

// TODO: it feels like this existence check is in the wrong place. In fact, why is it needed at all? Under what circumstances have we found a non-existent note being emitted accidentally?
fn assert_note_exists<let N: u32>(context: PrivateContext, note_hash_counter: u32) {
    // TODO(#8589): use typesystem to skip this check when not needed
    let note_exists =
        context.note_hashes.storage().any(|n: NoteHash| n.counter == note_hash_counter);
    assert(note_exists, "Can only emit a note log for an existing note.");
}

/// This particular log assembly strategy (AES 128) requires the note (and the
/// note_id and the storage_slot) to be converted into bytes, because the aes function
/// operates on bytes; not fields.
/// NB: The "2" in "N + 2" is for the note_id and the storage_slot of the note:
fn compute_note_plaintext_for_this_strategy<Note, let N: u32>(
    note: Note,
    storage_slot: Field,
) -> [Field; (N + 2)]
where
    Note: NoteType + Packable<N>,
{
    let packed_note = note.pack();

    let mut fields = [0; N + 2];

    // Note that we're almost accidentally following the standard log encoding here: because the note type id only uses
    // 7 bits, it just barely fits in the log metadata, and the log type id is implicitly 0 (i.e. a private note log).
    // Partial notes modify `get_id` to have it set the 8th bit, resulting in a log type id of 1 (i.e. a partial note
    // private log). Fields 1 to len are the note content, which we here hardcode to be the storage slot in the first
    // field, and the packed note following after.
    // Ideally we'd know if this is a private note or a partial note, and call a function that'd be the opposite of
    // discovery::private_notes::decode_private_note_log (or partial accordingly).
    fields[0] = Note::get_id();
    fields[1] = storage_slot;
    for i in 0..packed_note.len() {
        fields[i + 2] = packed_note[i];
    }

    fields
}

pub fn compute_log<Note, let N: u32>(
    context: PrivateContext,
    note: Note,
    storage_slot: Field,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Note: NoteType + Packable<N>,
{
    let final_plaintext = compute_note_plaintext_for_this_strategy(note, storage_slot);

    encrypt_log(context.this_address(), final_plaintext, recipient, sender)
}

pub unconstrained fn compute_log_unconstrained<Note, let N: u32>(
    context: PrivateContext,
    note: Note,
    storage_slot: Field,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Note: NoteType + Packable<N>,
{
    compute_log(context, note, storage_slot, recipient, sender)
}

/// Sends an encrypted message to `recipient` with the content of the note, which they will discover when processing
/// private logs.
pub fn encode_and_encrypt_note<Note, let N: u32>(
    context: &mut PrivateContext,
    recipient: AztecAddress,
    // We need this because to compute a tagging secret, we require a sender:
    sender: AztecAddress,
) -> fn[(&mut PrivateContext, AztecAddress, AztecAddress)](NoteEmission<Note>) -> ()
where
    Note: NoteType + Packable<N>,
{
    |e: NoteEmission<Note>| {
        let note = e.note;
        let storage_slot = e.storage_slot;
        let note_hash_counter = e.note_hash_counter;
        assert_note_exists(*context, note_hash_counter);

        let encrypted_log = compute_log(*context, note, storage_slot, recipient, sender);
        context.emit_raw_note_log(encrypted_log, note_hash_counter);
    }
}

/// Same as `encode_and_encrypt_note`, except encryption is unconstrained. This means that the sender is free to make
/// the log contents be whatever they wish, potentially resulting in scenarios in which the recipient is unable to
/// decrypt and process the payload, **leading to the note being lost**.
///
/// Only use this function in scenarios where the recipient not receiving the note is an acceptable outcome.
pub fn encode_and_encrypt_note_unconstrained<Note, let N: u32>(
    context: &mut PrivateContext,
    recipient: AztecAddress,
    // We need this because to compute a tagging secret, we require a sender:
    sender: AztecAddress,
) -> fn[(&mut PrivateContext, AztecAddress, AztecAddress)](NoteEmission<Note>) -> ()
where
    Note: NoteType + Packable<N>,
{
    |e: NoteEmission<Note>| {
        let note = e.note;
        let storage_slot = e.storage_slot;
        let note_hash_counter = e.note_hash_counter;

        assert_note_exists(*context, note_hash_counter);

        // Safety: this function does not constrain the encryption of the log, as explainted on its description.
        let encrypted_log =
            unsafe { compute_log_unconstrained(*context, note, storage_slot, recipient, sender) };
        context.emit_raw_note_log(encrypted_log, note_hash_counter);
    }
}
