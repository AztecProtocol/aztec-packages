use crate::{
    context::PrivateContext,
    encrypted_logs::encrypt::aes128::derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_sha256,
    keys::{
        ecdh_shared_secret::derive_ecdh_shared_secret_using_aztec_address,
        ephemeral::generate_ephemeral_key_pair,
    },
    note::{note_emission::NoteEmission, note_interface::NoteInterface},
    oracle::{
        notes::{get_app_tag_as_sender, increment_app_tagging_secret_index_as_sender},
        random::random,
    },
    utils::{
        bytes::{be_bytes_31_to_fields, get_random_bytes},
        point::{get_sign_of_point},
    },
};
use dep::protocol_types::{
    abis::note_hash::NoteHash,
    address::AztecAddress,
    constants::PRIVATE_LOG_SIZE_IN_FIELDS,
};
use std::aes128::aes128_encrypt;

// These globals are used in arithmetic with generics; hence why they're declared as globals.
// Local variables cannot be used in arithmetic with generics.

global TAG_SIZE_IN_FIELDS: u32 = 1;
global EPK_SIZE_IN_FIELDS: u32 = 1;

global USABLE_PRIVATE_LOG_SIZE_IN_FIELDS: u32 =
    PRIVATE_LOG_SIZE_IN_FIELDS - TAG_SIZE_IN_FIELDS - EPK_SIZE_IN_FIELDS;

// Let C = USABLE_PRIVATE_LOG_SIZE_IN_FIELDS.
// How many bytes is that? Call it D bytes.
// For this strategy, we'll be using `le_bytes_31_to_fields()` to convert the D
// output bytes into C output fields. That function will spit out ceil(D/31)
// fields, which we want to be equal to C fields.
// Note also that D will be a multiple of 16, as the output of AES.
// So let E * 16 = D.
// Solve: C = ceil(D / 31)
// C - 1 < D / 31 <= C
// So D is in the range: 31 * C - 31 < D <= 31 * C
// So E is in the range: (31 * C - 31) / 16 < E <= (31 * C) / 16
// floor((31 * c) / 16) is the value of E we want to choose.
// floor((31 * C) / 16) * 16 is the highest value of D that is a multiple of 16.
pub(crate) global USABLE_PRIVATE_LOG_SIZE_IN_BYTES: u32 =
    ((USABLE_PRIVATE_LOG_SIZE_IN_FIELDS * 31) / 16) * 16;

pub(crate) global HEADER_CIPHERTEXT_SIZE_IN_BYTES: u32 = 48; // contract_address + 16 bytes pkcs#7 AES padding (unfortunately).

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
 * log = [tag, epk, fixed_padding, header_ct=[[contract_address], pkcs7_pad], ct=[[pt_len, pt], pkcs7_pad]]
 *
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
 *                                    [u8; HEADER_PT_PADDING_SIZE_IN_BYTES]
 *             ): [u8; 48],
 *
 *             ciphertext: aes_encrypt(
 *                 final_pt: [
 *                                         // plaintexts can be longer than 2^8=256 bytes.
 *                     pt: {
 *                         note_bytes: {
 *                             storage_slot: [u8; 32],
 *                             note_type_id: [u8; 32],
 *                             ...note: [u8; N * 32],
 *                         }: [u8; N * 32 + 64],
 *                     }: [u8; N * 32 + 64],
 *
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
// Disgusting arithmetic on generics
/********************************************************/

// |full_pt| = |pt| = (N * 32) + 64
fn get_arr_of_size_full_pt<let PT: u32>() -> [u8; PT] {
    [0; PT]
}

// |pt_aes_padding| = 16 - (|full_pt| % 16)
fn get_arr_of_size_pt_aes_padding<let FULL_PT: u32>(
    _full_pt: [u8; FULL_PT],
) -> [u8; 16 - (FULL_PT % 16)] {
    [0; 16 - (FULL_PT % 16)]
}

// |ct| = |full_pt| + |pt_aes_padding|
fn get_arr_of_size_ct<let FULL_PT: u32, let PT_AES_PADDING: u32>(
    _full_pt: [u8; FULL_PT],
    _pt_aes_padding: [u8; PT_AES_PADDING],
) -> [u8; FULL_PT + PT_AES_PADDING] {
    [0; FULL_PT + PT_AES_PADDING]
}

// Ok, so we have the following bytes:
// eph_pk_sign, header_ciphertext, ciphertext
// Let b = 1 + 48 + |ct|.
fn get_arr_of_size_b<let CT: u32>(_ct: [u8; CT]) -> [u8; 1 + 48 + CT] {
    [0; 1 + 48 + CT]
}

// Recall:
//   b := 1 + 48 + |ct|
// We now want to pad b to the next multiple of 31, so as to "fill" fields.
// Let p be that padding.
// p = 31 * ceil(b / 31) - b
//   = 31 * ((b + 30) // 31) - b
//     (because ceil(x / y) = (x + y - 1) // y ).
fn get_arr_of_size_p<let B: u32>(_b: [u8; B]) -> [u8; (31 * ((B + 30) / 31)) - B] {
    [0; 31 * ((B + 30) / 31) - B]
}

// |log_bytes| = 1 + 48 + |ct| + p
// Recall:
//   b := 1 + 48 + |ct|
fn get_arr_of_size_log_bytes<let B: u32, let P: u32>(_b: [u8; B], _p: [u8; P]) -> [u8; B + P] {
    [0; B + P]
}

// We need to pad with some extra fields:
// |log_bytes| = 1 + 48 + |ct| + p
// = 31 * (((1 + 48 + (16 * (1 + ( 2 + (N * 32) + 64 ) // 16))) + 30) // 31)
//
// |log_bytes_as_fields| = |log_bytes| / 31 (note that this is exactly divisible
// by 31, by the design of p).
//
// |fields_padding| = USABLE_PRIVATE_LOG_SIZE_IN_FIELDS - |log_bytes_as_fields|
fn get_arr_of_size_fields_padding<let LOG_BYTES: u32>(
    _log_bytes: [u8; LOG_BYTES],
) -> [Field; USABLE_PRIVATE_LOG_SIZE_IN_FIELDS - LOG_BYTES / 31] {
    [0; USABLE_PRIVATE_LOG_SIZE_IN_FIELDS - LOG_BYTES / 31]
}

// The return type is pasted from the LSP's expectation, because it was too difficult
// to match its weird way of doing algebra. It doesn't know all rules of arithmetic.
pub(crate) fn get_arr_of_size_p_from_PT<let PT: u32>() -> [u8; ((((((PT + (16 - (PT % 16))) + 49) + 30) / 31) * 31) - ((PT + (16 - (PT % 16))) + 49))] {
    let full_pt = get_arr_of_size_full_pt::<PT>();
    let pt_aes_padding = get_arr_of_size_pt_aes_padding(full_pt);
    let ct = get_arr_of_size_ct(full_pt, pt_aes_padding);
    let b = get_arr_of_size_b(ct);
    let p = get_arr_of_size_p(b);
    p
}

// The return type is pasted from the LSP's expectation, because it was too difficult
// to match its weird way of doing algebra. It doesn't know all rules of arithmetic.
pub(crate) fn get_arr_of_size_log_bytes_from_PT<let PT: u32>() -> [u8; (((PT + (16 - (PT % 16))) + 49) + ((((((PT + (16 - (PT % 16))) + 49) + 30) / 31) * 31) - ((PT + (16 - (PT % 16))) + 49)))] {
    let full_pt = get_arr_of_size_full_pt::<PT>();
    let pt_aes_padding = get_arr_of_size_pt_aes_padding(full_pt);
    let ct = get_arr_of_size_ct(full_pt, pt_aes_padding);
    let b = get_arr_of_size_b(ct);
    let p = get_arr_of_size_p(b);
    let log_bytes = get_arr_of_size_log_bytes(b, p);
    log_bytes
}

// The return type is pasted from the LSP's expectation, because it was too difficult
// to match its weird way of doing algebra. It doesn't know all rules of arithmetic.
pub(crate) fn get_arr_of_size_fields_padding_from_PT<let PT: u32>() -> [Field; (16 - (((((PT + (16 - (PT % 16))) + 79) / 31) * 31) / 31))] {
    let log_bytes = get_arr_of_size_log_bytes_from_PT::<PT>();
    let fields_padding = get_arr_of_size_fields_padding(log_bytes);
    fields_padding
}

/********************************************************/
// End of disgusting arithmetic on generics
/********************************************************/

fn compute_log<Note, let N: u32>(
    context: PrivateContext,
    note: Note,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> ([Field; PRIVATE_LOG_SIZE_IN_FIELDS], u32)
where
    Note: NoteInterface<N>,
{
    // *****************************************************************************
    // Compute the shared secret
    // *****************************************************************************

    let (eph_sk, eph_pk) = generate_ephemeral_key_pair();

    let eph_pk_sign_byte: u8 = get_sign_of_point(eph_pk) as u8;

    let ciphertext_shared_secret = derive_ecdh_shared_secret_using_aztec_address(eph_sk, recipient); // not to be confused with the tagging shared secret

    // TODO: also use this shared secret for deriving note randomness.

    // *****************************************************************************
    // Ensure the note exists
    // *****************************************************************************

    let note_header = note.get_header();
    let note_hash_counter = note_header.note_hash_counter;
    // TODO(#8589): use typesystem to skip this check when not needed
    let note_exists =
        context.note_hashes.storage().any(|n: NoteHash| n.counter == note_hash_counter);
    assert(note_exists, "Can only emit a note log for an existing note.");

    // *****************************************************************************
    // Optionally convert some/all of the note to bytes, so that we may then
    // prepend/append extra bytes, in a tightly-packed way.
    // *****************************************************************************

    let storage_slot = note_header.storage_slot;

    // The extra 64 bytes is the note_id and the storage_slot of the note:
    let note_bytes = note.to_be_bytes(storage_slot);

    // *****************************************************************************
    // Prepend/append extra bytes
    // *****************************************************************************

    // "Proper" meaning the main meaty stuff that we care about.
    let proper_plaintext: [u8; (N * 32) + 64] = note_bytes;
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

    // |full_pt| = |pt_length| + |pt|
    // |pt_aes_padding| = 16 - (|full_pt| % 16)
    // or... since a % b is the same as a - b * (a // b) (integer division), so:
    // |pt_aes_padding| = 16 - (|full_pt| - 16 * (|full_pt| // 16))
    // |ct| = |full_pt| + |pt_aes_padding|
    //      = |full_pt| + 16 - (|full_pt| - 16 * (|full_pt| // 16))
    //      = 16 + 16 * (|full_pt| // 16)
    //      = 16 * (1 + |full_pt| // 16)
    assert(ciphertext_bytes.len() == 16 * (1 + ((N * 32) + 64) / 16));

    // *****************************************************************************
    // Compute the header ciphertext
    // *****************************************************************************

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

    let mut log_bytes_padding_to_mult_31 = get_arr_of_size_p_from_PT::<(N * 32) + 64>();
    log_bytes_padding_to_mult_31 = unsafe { get_random_bytes() };

    let mut log_bytes = get_arr_of_size_log_bytes_from_PT::<(N * 32) + 64>();

    assert(
        log_bytes.len() % 31 == 0,
        "Unexpected error: log_bytes.len() should be divisible by 31, by construction.",
    );

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

    assert(
        offset + log_bytes_padding_to_mult_31.len() == log_bytes.len(),
        "Something has gone wrong",
    );

    // *****************************************************************************
    // Convert bytes back to fields
    // *****************************************************************************

    let log_bytes_as_fields = be_bytes_31_to_fields(log_bytes);

    // *****************************************************************************
    // Prepend / append fields, to create the final log
    // *****************************************************************************

    // We need to pad with some extra fields:
    let fields_padding = get_arr_of_size_fields_padding_from_PT::<(N * 32) + 64>();

    // In this strategy, we prepend [tag, eph_pk.x]

    // We assume that the sender wants for the recipient to find the tagged note,
    // and therefore that they will cooperate and use the correct tag. Usage of a bad
    // tag will result in the recipient not being able to find the note automatically.
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
        final_log[i] = unsafe { random() };
    }

    (final_log, note_hash_counter)
}

unconstrained fn compute_log_unconstrained<Note, let N: u32>(
    context: PrivateContext,
    note: Note,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> ([Field; PRIVATE_LOG_SIZE_IN_FIELDS], u32)
where
    Note: NoteInterface<N>,
{
    compute_log(context, note, recipient, sender)
}

// This function seems to be affected by the following Noir bug:
// https://github.com/noir-lang/noir/issues/5771
// If you get weird behavior it might be because of it.
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
        let (encrypted_log, note_hash_counter) = compute_log(*context, e.note, recipient, sender);
        context.emit_raw_note_log(encrypted_log, note_hash_counter);
    }
}

// Important note: this function -- although called "unconstrained" -- the
// function is not labelled as `unconstrained`, because we pass a reference to the
// context.
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
            unsafe { compute_log_unconstrained(*context, e.note, recipient, sender) };
        context.emit_raw_note_log(encrypted_log, note_hash_counter);
    }
}
