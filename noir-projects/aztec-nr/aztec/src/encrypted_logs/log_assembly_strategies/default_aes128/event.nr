use crate::{
    context::PrivateContext,
    encrypted_logs::{
        encrypt::aes128::derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_sha256,
        log_assembly_strategies::default_aes128::{
            arithmetic_generics_utils::{
                get_arr_of_size__log_bytes__from_PT, get_arr_of_size__log_bytes_padding__from_PT,
            },
            note::encryption::HEADER_CIPHERTEXT_SIZE_IN_BYTES,
        },
    },
    event::event_interface::EventInterface,
    keys::{
        ecdh_shared_secret::derive_ecdh_shared_secret_using_aztec_address,
        ephemeral::generate_ephemeral_key_pair,
    },
    oracle::notes::{get_app_tag_as_sender, increment_app_tagging_secret_index_as_sender},
    utils::{
        conversion::{bytes_to_fields::bytes_to_fields, fields_to_bytes::fields_to_bytes},
        point::get_sign_of_point,
        random::get_random_bytes,
    },
};
use dep::protocol_types::{
    address::AztecAddress,
    constants::PRIVATE_LOG_SIZE_IN_FIELDS,
    traits::{Serialize, ToField},
};
use std::aes128::aes128_encrypt;

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
 *
 * There is some minimal de-duplication in common.nr.
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
 */

/*
 * LOG LAYOUT CHOICE:
 *
 * As per ./note.nr, but replace `note_bytes` with `event_bytes`.
 */

/// This particular log assembly strategy (AES 128) requires the event (and the
/// event_type_id) to be converted into bytes, because the aes function
/// operates on bytes; not fields.
/// NB: The extra `+ 1` is for the event_type_id:
fn compute_event_plaintext_for_this_strategy<Event, let N: u32>(event: Event) -> [u8; (N + 1) * 32]
where
    Event: EventInterface<N>,
{
    let serialized_event = Serialize::<N>::serialize(event);

    let mut fields = [0; N + 1];
    fields[0] = Event::get_event_type_id().to_field();
    for i in 0..serialized_event.len() {
        fields[i + 1] = serialized_event[i];
    }

    fields_to_bytes(fields)
}

// Note: This function is basically a copy of ./note/encryption.nr::encrypt_log. TODO: Merge the functions once
// the final note and event log layout is clear. Seems to me that the functions should be the same as encrypt_log
// is quite general and takes in an arbitrary plaintext. The note specific thing seems to be that in that function
// we perform some note-specific log length assertions.
fn compute_log<Event, let N: u32>(
    context: PrivateContext,
    event: Event,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Event: EventInterface<N>,
{
    // *****************************************************************************
    // Compute the shared secret
    // *****************************************************************************

    let (eph_sk, eph_pk) = generate_ephemeral_key_pair();

    let eph_pk_sign_byte: u8 = get_sign_of_point(eph_pk) as u8;

    let ciphertext_shared_secret = derive_ecdh_shared_secret_using_aztec_address(eph_sk, recipient);

    // TODO: also use this shared secret for deriving note randomness.

    // *****************************************************************************
    // Optionally convert some/all of the event to bytes, so that we may then
    // prepend/append extra bytes, in a tightly-packed way.
    // *****************************************************************************

    // This includes the note_id and the storage_slot of the note:
    // TODO: the note_id doesn't need to be a full field; it can be a single byte.
    let event_bytes = compute_event_plaintext_for_this_strategy(event);

    // *****************************************************************************
    // Prepend/append extra bytes
    // *****************************************************************************

    // "Proper" meaning the main meaty stuff that we care about.
    let proper_plaintext = event_bytes;
    let final_plaintext = proper_plaintext;

    // *****************************************************************************
    // Convert the plaintext into whatever format the encryption function expects
    // *****************************************************************************

    // Already done for this strategy: AES expects bytes.

    // *****************************************************************************
    // Encrypt the plaintext
    // *****************************************************************************

    let (sym_key, iv) = derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_sha256(
        ciphertext_shared_secret,
    );

    let ciphertext_bytes = aes128_encrypt(final_plaintext, iv, sym_key);

    assert(ciphertext_bytes.len() == 16 * (1 + ((N * 32) + 32) / 16));

    // *****************************************************************************
    // Compute the header ciphertext
    // *****************************************************************************

    // TODO: this header section will be deleted soon.
    let contract_address = context.this_address();
    let contract_address_bytes = contract_address.to_field().to_be_bytes::<32>();

    let mut header_plaintext: [u8; 32 + 2] = [0; 32 + 2];
    for i in 0..32 {
        header_plaintext[i] = contract_address_bytes[i];
    }
    let offset = 32;
    let ciphertext_bytes_length = ciphertext_bytes.len();
    header_plaintext[offset] = (ciphertext_bytes_length >> 8) as u8;
    header_plaintext[offset + 1] = ciphertext_bytes_length as u8;

    // TODO: this is insecure and wasteful:
    // "Insecure", because the esk shouldn't be used twice (once for the header,
    // and again for the proper ciphertext) (at least, I never got the
    // "go ahead" that this would be safe, unfortunately).
    // "Wasteful", because the exact same computation is happening further down.
    // I'm leaving that 2nd computation where it is, because this 1st computation
    // will be imminently deleted, when the header logic is deleted.
    let (sym_key, iv) = derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_sha256(
        ciphertext_shared_secret,
    );

    // Note: the aes128_encrypt builtin fn automatically appends bytes to the
    // input, according to pkcs#7; hence why the output `header_ciphertext_bytes` is 16
    // bytes larger than the input in this case.
    let header_ciphertext_bytes = aes128_encrypt(header_plaintext, iv, sym_key);
    // I recall that converting a slice to an array incurs constraints, so I'll check the length this way instead:
    assert(header_ciphertext_bytes.len() == HEADER_CIPHERTEXT_SIZE_IN_BYTES);

    // *****************************************************************************
    // Prepend / append more bytes of data to the ciphertext, before converting back
    // to fields.
    // *****************************************************************************

    let mut log_bytes_padding_to_mult_31 =
        get_arr_of_size__log_bytes_padding__from_PT::<(N * 32) + 32>();

    // Safety: we assume that the sender wants for the log to be private - a malicious one could simply reveal its
    // contents publicly. It is therefore fine to trust the sender to provide random padding.
    log_bytes_padding_to_mult_31 = unsafe { get_random_bytes() };

    let mut log_bytes = get_arr_of_size__log_bytes__from_PT::<(N * 32) + 32>();

    log_bytes[0] = eph_pk_sign_byte;
    let mut offset = 1;
    for i in 0..header_ciphertext_bytes.len() {
        log_bytes[offset + i] = header_ciphertext_bytes[i];
    }
    offset += header_ciphertext_bytes.len();

    for i in 0..ciphertext_bytes.len() {
        log_bytes[offset + i] = ciphertext_bytes[i];
    }
    offset += ciphertext_bytes.len();

    for i in 0..log_bytes_padding_to_mult_31.len() {
        log_bytes[offset + i] = log_bytes_padding_to_mult_31[i];
    }

    // *****************************************************************************
    // Convert the encrypted bytes to fields, because logs are field-based
    // *****************************************************************************

    // TODO(#12749): As Mike pointed out, we need to make logs produced by different encryption schemes
    // indistinguishable from each other and for this reason the output here and in the last for-loop of this function
    // should cover a full field.
    let log_bytes_as_fields = bytes_to_fields(log_bytes);

    // *****************************************************************************
    // Prepend / append fields, to create the final log
    // *****************************************************************************

    // In this strategy, we prepend [tag, eph_pk.x]

    // Safety: we assume that the sender wants for the recipient to find the tagged note, and therefore that they will
    // cooperate and use the correct tag. Usage of a bad tag will result in the recipient not being able to find the
    // note automatically.
    let tag = unsafe { get_app_tag_as_sender(sender, recipient) };
    increment_app_tagging_secret_index_as_sender(sender, recipient);

    let mut final_log: [Field; PRIVATE_LOG_SIZE_IN_FIELDS] = [0; PRIVATE_LOG_SIZE_IN_FIELDS];

    final_log[0] = tag;
    final_log[1] = eph_pk.x;

    let mut offset = 2;
    for i in 0..log_bytes_as_fields.len() {
        final_log[offset + i] = log_bytes_as_fields[i];
    }
    offset += log_bytes_as_fields.len();

    for i in offset..PRIVATE_LOG_SIZE_IN_FIELDS {
        // We need to get a random value that fits in 31 bytes to not leak information about the size of the log
        // (all the "real" log fields contain at most 31 bytes because of the way we convert the bytes to fields).
        // TODO(#12749): Long term, this is not a good solution.

        // Safety: we assume that the sender wants for the log to be private - a malicious one could simply reveal its
        // contents publicly. It is therefore fine to trust the sender to provide random padding.
        let field_bytes = unsafe { get_random_bytes::<31>() };
        final_log[i] = Field::from_be_bytes::<31>(field_bytes);
    }

    final_log
}

unconstrained fn compute_log_unconstrained<Event, let N: u32>(
    context: PrivateContext,
    event: Event,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Event: EventInterface<N>,
{
    compute_log(context, event, recipient, sender)
}

/// Sends an encrypted message to `recipient` with the content of the event, which they will discover when processing
/// private logs.
pub fn encode_and_encrypt_event<Event, let N: u32>(
    context: &mut PrivateContext,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> fn[(&mut PrivateContext, AztecAddress, AztecAddress)](Event) -> ()
where
    Event: EventInterface<N>,
{
    |e: Event| {
        let encrypted_log = compute_log(*context, e, recipient, sender);
        context.emit_private_log(encrypted_log);
    }
}

/// Same as `encode_and_encrypt_event`, except encryption is unconstrained. This means that the sender is free to make
/// the log contents be whatever they wish, potentially resulting in scenarios in which the recipient is unable to
/// decrypt and process the payload, **leading to the event being lost**.
///
/// Only use this function in scenarios where the recipient not receiving the event is an acceptable outcome.
pub fn encode_and_encrypt_event_unconstrained<Event, let N: u32>(
    context: &mut PrivateContext,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> fn[(&mut PrivateContext, AztecAddress, AztecAddress)](Event) -> ()
where
    Event: EventInterface<N>,
{
    |e: Event| {
        // Safety: this function does not constrain the encryption of the log, as explainted on its description.
        let encrypted_log = unsafe { compute_log_unconstrained(*context, e, recipient, sender) };
        context.emit_private_log(encrypted_log);
    }
}
