use crate::{
    context::PrivateContext,
    encrypted_logs::{
        log_assembly_strategies::default_aes128::aes128::AES128, log_encryption::LogEncryption,
    },
    note::{note_emission::NoteEmission, note_interface::NoteType},
    oracle::notes::{get_app_tag_as_sender, increment_app_tagging_secret_index_as_sender},
};
use dep::protocol_types::{
    abis::note_hash::NoteHash, address::AztecAddress, constants::PRIVATE_LOG_SIZE_IN_FIELDS,
    traits::Packable,
};

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
    note: Note,
    storage_slot: Field,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Note: NoteType + Packable<N>,
{
    let plaintext = compute_note_plaintext_for_this_strategy(note, storage_slot);

    let ciphertext = AES128::encrypt_log(plaintext, recipient);

    let log = prefix_with_tag(ciphertext, sender, recipient);

    log
}

fn prefix_with_tag<let L: u32>(
    log_without_tag: [Field; L],
    sender: AztecAddress,
    recipient: AztecAddress,
) -> [Field; L + 1] {
    // Safety: we assume that the sender wants for the recipient to find the tagged note, and therefore that they will
    // cooperate and use the correct tag. Usage of a bad tag will result in the recipient not being able to find the
    // note automatically.
    let tag = unsafe { get_app_tag_as_sender(sender, recipient) };
    increment_app_tagging_secret_index_as_sender(sender, recipient);

    let mut log_with_tag = [0; L + 1];

    log_with_tag[0] = tag;
    for i in 0..log_without_tag.len() {
        log_with_tag[i + 1] = log_without_tag[i];
    }

    log_with_tag
}

pub unconstrained fn compute_log_unconstrained<Note, let N: u32>(
    note: Note,
    storage_slot: Field,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Note: NoteType + Packable<N>,
{
    compute_log(note, storage_slot, recipient, sender)
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

        let encrypted_log = compute_log(note, storage_slot, recipient, sender);
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

        // Safety: this function does not constrain the encryption of the log, as explained on its description.
        let encrypted_log =
            unsafe { compute_log_unconstrained(note, storage_slot, recipient, sender) };
        context.emit_raw_note_log(encrypted_log, note_hash_counter);
    }
}

mod test {
    use super::prefix_with_tag;
    use protocol_types::{
        address::AztecAddress,
        indexed_tagging_secret::IndexedTaggingSecret,
        traits::{Deserialize, FromField, Serialize},
    };
    use std::test::OracleMock;

    #[test]
    unconstrained fn prefixing_with_tag() {
        let sender = AztecAddress::from_field(1);
        let recipient = AztecAddress::from_field(2);

        let app_tagging_secret = 42;
        let index = 5;

        // I am using the deserialize trait instead of directly instantiating the IndexedTaggingSecret struct because
        // direct instantiation functionality is not exposed.
        let indexed_tagging_secret = IndexedTaggingSecret::deserialize([app_tagging_secret, index]);

        // Mock the tagging oracles
        let _ = OracleMock::mock("getIndexedTaggingSecretAsSender").returns(indexed_tagging_secret
            .serialize());
        let _ = OracleMock::mock("incrementAppTaggingSecretIndexAsSender").returns(());

        let log_without_tag = [1, 2, 3];
        let log_with_tag = prefix_with_tag(log_without_tag, sender, recipient);

        let expected_result = [indexed_tagging_secret.compute_tag(recipient), 1, 2, 3];

        // Check tag was prefixed correctly
        assert_eq(log_with_tag, expected_result, "Tag was not prefixed correctly");
    }
}
