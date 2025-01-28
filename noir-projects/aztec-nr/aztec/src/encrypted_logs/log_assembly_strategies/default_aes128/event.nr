use crate::{
    context::PrivateContext,
    encrypted_logs::{
        encrypt::aes128::derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_sha256,
        log_assembly_strategies::default_aes128::note::{
            get_arr_of_size__log_bytes_padding__from_plaintext, HEADER_CIPHERTEXT_SIZE_IN_BYTES,
        },
    },
    event::event_interface::EventInterface,
    keys::{
        ecdh_shared_secret::derive_ecdh_shared_secret_using_aztec_address,
        ephemeral::generate_ephemeral_key_pair,
    },
    oracle::{
        notes::{get_app_tag_as_sender, increment_app_tagging_secret_index_as_sender},
        random::random,
    },
    utils::{bytes::{be_bytes_31_to_fields, get_random_bytes}, point::get_sign_of_point},
};
use dep::protocol_types::{
    address::AztecAddress,
    constants::PRIVATE_LOG_SIZE_IN_FIELDS,
    traits::Serialize,
    utils::arrays::{array_concat, array_concat_3, array_concat_4},
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
/// NB: The extra `+ 32` bytes is for the event_type_id:
fn compute_event_plaintext_for_this_strategy<Event, let N: u32>(event: Event) -> [u8; N * 32 + 32]
where
    Event: EventInterface<N>,
{
    let serialized_event = Serialize::<N>::serialize(event);

    let event_type_id_bytes: [u8; 32] = Event::get_event_type_id().to_field().to_be_bytes();

    let mut plaintext_bytes = [0 as u8; N * 32 + 32];

    for i in 0..32 {
        plaintext_bytes[i] = event_type_id_bytes[i];
    }

    for i in 0..serialized_event.len() {
        let bytes: [u8; 32] = serialized_event[i].to_be_bytes();
        for j in 0..32 {
            plaintext_bytes[32 + i * 32 + j] = bytes[j];
        }
    }

    plaintext_bytes
}

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

    let ciphertext_bytes_length = ciphertext_bytes.len();
    let encoding_of_ciphertext_size_in_bytes =
        [(ciphertext_bytes_length >> 8) as u8, ciphertext_bytes_length as u8];

    let header_plaintext =
        array_concat(contract_address_bytes, encoding_of_ciphertext_size_in_bytes);

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
    let header_ciphertext_bytes: [u8; HEADER_CIPHERTEXT_SIZE_IN_BYTES] =
        aes128_encrypt(header_plaintext, iv, sym_key);

    // *****************************************************************************
    // Prepend / append more bytes of data to the ciphertext, before converting back
    // to fields.
    // *****************************************************************************

    let mut log_bytes_padding_to_mult_31 =
        get_arr_of_size__log_bytes_padding__from_plaintext(final_plaintext);
    /// Safety: this randomness won't be constrained to be random. It's in the
    /// interest of the executor of this fn to encrypt with random bytes.
    log_bytes_padding_to_mult_31 = unsafe { get_random_bytes() };

    let log_bytes = array_concat_4(
        [eph_pk_sign_byte],
        header_ciphertext_bytes,
        ciphertext_bytes,
        log_bytes_padding_to_mult_31,
    );

    // *****************************************************************************
    // Convert bytes back to fields
    // *****************************************************************************

    let log_bytes_as_fields = be_bytes_31_to_fields(log_bytes);

    // *****************************************************************************
    // Prepend / append fields, to create the final log
    // *****************************************************************************

    // In this strategy, we prepend [tag, eph_pk.x]

    // We assume that the sender wants for the recipient to find the tagged note,
    // and therefore that they will cooperate and use the correct tag. Usage of a bad
    // tag will result in the recipient not being able to find the note automatically.
    let tag = unsafe { get_app_tag_as_sender(sender, recipient) };
    increment_app_tagging_secret_index_as_sender(sender, recipient);

    // We pad any unused fields of the final log with random fields, so that all
    // logs on the network are indistinguishable.
    // TODO(#8977): consider introducing various sizes of log privacy set, so that
    // we're not broadcasting so many wasteful bytes for all apps.
    //
    // Note: this tidier approach did not work: it broke the compiler with some kind of
    // stack too deep error, maybe as a result of the huge arithmetic generic statements
    // it needed to evaluate to get the fields_padding array size.
    // let final_log_random_fields_padding = get_arr_of_size__fields_padding__from_plaintext(final_plaintext_bytes);
    // for i in 0..final_log_random_fields_padding.len() {
    //     /// Safety: randomness cannot be constrained.
    //     final_log[i] = unsafe { random() };
    // }
    // let final_log = array_concat_3([tag, eph_pk.x], log_bytes_as_fields, final_log_random_fields_padding);

    let final_log_without_padding = array_concat([tag, eph_pk.x], log_bytes_as_fields);
    let mut final_log = [0; PRIVATE_LOG_SIZE_IN_FIELDS];
    for i in 0..final_log_without_padding.len() {
        final_log[i] = final_log_without_padding[i];
    }
    let offset = final_log_without_padding.len();
    for i in offset..final_log.len() {
        /// Safety: randomness cannot be constrained.
        final_log[i] = unsafe { random() };
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

// Important note: this function -- although called "unconstrained" -- the
// function is not labelled as `unconstrained`, because we pass a reference to the
// context. Pushing something to the context must always be constrained.
pub fn encode_and_encrypt_event_unconstrained<Event, let N: u32>(
    context: &mut PrivateContext,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> fn[(&mut PrivateContext, AztecAddress, AztecAddress)](Event) -> ()
where
    Event: EventInterface<N>,
{
    |e: Event| {
        // Unconstrained logs have both their content and encryption unconstrained - it could occur that the
        // recipient is unable to decrypt the payload.
        let encrypted_log = unsafe { compute_log_unconstrained(*context, e, recipient, sender) };
        context.emit_private_log(encrypted_log);
    }
}
