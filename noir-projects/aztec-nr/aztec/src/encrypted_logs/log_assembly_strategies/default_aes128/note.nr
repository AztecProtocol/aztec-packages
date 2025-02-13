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
    utils::{bytes::{be_bytes_31_to_fields, get_random_bytes}, point::get_sign_of_point},
};
use dep::protocol_types::{
    abis::note_hash::NoteHash, address::AztecAddress, constants::PRIVATE_LOG_SIZE_IN_FIELDS,
};
use std::aes128::aes128_encrypt;

pub(crate) global HEADER_CIPHERTEXT_SIZE_IN_BYTES: u32 = 48; // contract_address (32) + ciphertext_length (2) + 16 bytes pkcs#7 AES padding.

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
// Disgusting arithmetic on generics
/********************************************************/

// In this section, instead of initialising arrays with very complicated generic
// arithmetic, such as:
// let my_arr: [u8; (((PT + (16 - (PT % 16))) + 49) + ((((((PT + (16 - (PT % 16))) + 49) + 30) / 31) * 31) - ((PT + (16 - (PT % 16))) + 49)))] = [0; (((PT + (16 - (PT % 16))) + 49) + ((((((PT + (16 - (PT % 16))) + 49) + 30) / 31) * 31) - ((PT + (16 - (PT % 16))) + 49)))];
//... we instead do the arithmetic a little bit at a time, so that the computation
// can be audited and understood. Now, we can't do arithmetic on generics in the body
// of a function, so we abusing functions in the following way:

// |full_pt| = |pt| = (N * 32) + 64
fn get_arr_of_size__full_plaintext<let PT: u32>() -> [u8; PT] {
    [0; PT]
}

// |pt_aes_padding| = 16 - (|full_pt| % 16)
fn get_arr_of_size__plaintext_aes_padding<let FULL_PT: u32>(
    _full_pt: [u8; FULL_PT],
) -> [u8; 16 - (FULL_PT % 16)] {
    [0; 16 - (FULL_PT % 16)]
}

// |ct| = |full_pt| + |pt_aes_padding|
fn get_arr_of_size__ciphertext<let FULL_PT: u32, let PT_AES_PADDING: u32>(
    _full_pt: [u8; FULL_PT],
    _pt_aes_padding: [u8; PT_AES_PADDING],
) -> [u8; FULL_PT + PT_AES_PADDING] {
    [0; FULL_PT + PT_AES_PADDING]
}

// Ok, so we have the following bytes:
// eph_pk_sign, header_ciphertext, ciphertext:
// Let lbwop = 1 + 48 + |ct| // aka log bytes without padding
fn get_arr_of_size__log_bytes_without_padding<let CT: u32>(_ct: [u8; CT]) -> [u8; 1 + 48 + CT] {
    [0; 1 + 48 + CT]
}

// Recall:
//   lbwop := 1 + 48 + |ct| // aka log bytes without padding
// We now want to pad b to the next multiple of 31, so as to "fill" fields.
// Let p be that padding.
// p = 31 * ceil(lbwop / 31) - lbwop
//   = 31 * ((lbwop + 30) // 31) - lbwop
//     (because ceil(x / y) = (x + y - 1) // y ).
fn get_arr_of_size__log_bytes_padding<let LBWOP: u32>(
    _lbwop: [u8; LBWOP],
) -> [u8; (31 * ((LBWOP + 30) / 31)) - LBWOP] {
    [0; (31 * ((LBWOP + 30) / 31)) - LBWOP]
}

// |log_bytes| = 1 + 48 + |ct| + p // aka log bytes (with padding)
// Recall:
//   lbwop := 1 + 48 + |ct|
//   p is the padding
fn get_arr_of_size__log_bytes<let LBWOP: u32, let P: u32>(
    _lbwop: [u8; LBWOP],
    _p: [u8; P],
) -> [u8; LBWOP + P] {
    [0; LBWOP + P]
}

// The return type is pasted from the LSP's expectation, because it was too difficult
// to match its weird way of doing algebra. It doesn't know all rules of arithmetic.
// PT is the plaintext length.
pub(crate) fn get_arr_of_size__log_bytes_padding__from_PT<let PT: u32>() -> [u8; ((((((PT + (16 - (PT % 16))) + 49) + 30) / 31) * 31) - ((PT + (16 - (PT % 16))) + 49))] {
    let full_pt = get_arr_of_size__full_plaintext::<PT>();
    let pt_aes_padding = get_arr_of_size__plaintext_aes_padding(full_pt);
    let ct = get_arr_of_size__ciphertext(full_pt, pt_aes_padding);
    let lbwop = get_arr_of_size__log_bytes_without_padding(ct);
    let p = get_arr_of_size__log_bytes_padding(lbwop);
    p
}

// The return type is pasted from the LSP's expectation, because it was too difficult
// to match its weird way of doing algebra. It doesn't know all rules of arithmetic.
pub(crate) fn get_arr_of_size__log_bytes__from_PT<let PT: u32>() -> [u8; (((PT + (16 - (PT % 16))) + 49) + ((((((PT + (16 - (PT % 16))) + 49) + 30) / 31) * 31) - ((PT + (16 - (PT % 16))) + 49)))] {
    let full_pt = get_arr_of_size__full_plaintext::<PT>();
    let pt_aes_padding = get_arr_of_size__plaintext_aes_padding(full_pt);
    let ct = get_arr_of_size__ciphertext(full_pt, pt_aes_padding);
    let lbwop = get_arr_of_size__log_bytes_without_padding(ct);
    let p = get_arr_of_size__log_bytes_padding(lbwop);
    let log_bytes = get_arr_of_size__log_bytes(lbwop, p);
    log_bytes
}

/********************************************************/
// End of disgusting arithmetic on generics
/********************************************************/

// TODO: it feels like this existence check is in the wrong place. In fact, why is it needed at all? Under what circumstances have we found a non-existent note being emitted accidentally?
fn assert_note_exists<Note, let N: u32>(context: PrivateContext, note: Note)
where
    Note: NoteInterface<N>,
{
    let note_header = note.get_header();
    let note_hash_counter = note_header.note_hash_counter;
    // TODO(#8589): use typesystem to skip this check when not needed
    let note_exists =
        context.note_hashes.storage().any(|n: NoteHash| n.counter == note_hash_counter);
    assert(note_exists, "Can only emit a note log for an existing note.");
}

/// This particular log assembly strategy (AES 128) requires the note (and the
/// note_id and the storage_slot) to be converted into bytes, because the aes function
/// operates on bytes; not fields.
/// NB: The extra `+ 64` bytes is for the note_id and the storage_slot of the note:
fn compute_note_plaintext_for_this_strategy<Note, let N: u32>(
    note: Note,
    storage_slot: Field,
) -> [u8; N * 32 + 64]
where
    Note: NoteInterface<N>,
{
    let packed_note = note.pack_content();

    let note_header = note.get_header();
    let storage_slot_bytes: [u8; 32] = storage_slot.to_be_bytes();

    // TODO(#10952): The following can be reduced to 7 bits
    let note_type_id_bytes: [u8; 32] = Note::get_note_type_id().to_be_bytes();

    // We combine all the bytes into plaintext_bytes:
    let mut plaintext_bytes: [u8; N * 32 + 64] = [0; N * 32 + 64];
    for i in 0..32 {
        plaintext_bytes[i] = storage_slot_bytes[i];
        plaintext_bytes[32 + i] = note_type_id_bytes[i];
    }

    for i in 0..packed_note.len() {
        let bytes: [u8; 32] = packed_note[i].to_be_bytes();
        for j in 0..32 {
            plaintext_bytes[64 + i * 32 + j] = bytes[j];
        }
    }

    plaintext_bytes
}

fn compute_log<Note, let N: u32>(
    context: PrivateContext,
    note: Note,
    storage_slot: Field,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
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
    // Compute the plaintext
    // *****************************************************************************

    let final_plaintext_bytes = compute_note_plaintext_for_this_strategy(note, storage_slot);

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

    let ciphertext_bytes = aes128_encrypt(final_plaintext_bytes, iv, sym_key);

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

    let mut log_bytes_padding_to_mult_31 =
        get_arr_of_size__log_bytes_padding__from_PT::<(N * 32) + 64>();
    /// Safety: this randomness won't be constrained to be random. It's in the
    /// interest of the executor of this fn to encrypt with random bytes.
    log_bytes_padding_to_mult_31 = unsafe { get_random_bytes() };

    let mut log_bytes = get_arr_of_size__log_bytes__from_PT::<(N * 32) + 64>();

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
        /// Safety: randomness cannot be constrained.
        final_log[i] = unsafe { random() };
    }

    final_log
}

unconstrained fn compute_log_unconstrained<Note, let N: u32>(
    context: PrivateContext,
    note: Note,
    storage_slot: Field,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Note: NoteInterface<N>,
{
    compute_log(context, note, storage_slot, recipient, sender)
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
        let note = e.note;
        let storage_slot = e.storage_slot;
        assert_note_exists(*context, note);

        let note_hash_counter = note.get_header().note_hash_counter;

        let encrypted_log = compute_log(*context, note, storage_slot, recipient, sender);
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
        let note = e.note;
        let storage_slot = e.storage_slot;
        assert_note_exists(*context, note);

        let note_hash_counter = note.get_header().note_hash_counter;

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
        let encrypted_log =
            unsafe { compute_log_unconstrained(*context, note, storage_slot, recipient, sender) };
        context.emit_raw_note_log(encrypted_log, note_hash_counter);
    }
}

mod test {
    use crate::test::{helpers::test_environment::TestEnvironment, mocks::mock_note::MockNote};
    use dep::protocol_types::address::AztecAddress;
    use std::test::OracleMock;

    #[test]
    unconstrained fn test_encrypted_log_matches_typescript() {
        let mut env = TestEnvironment::new();
        // Advance 1 block so we can read historic state from private
        env.advance_block_by(1);
        let mut context = env.private();

        // I'm not sure how to initialise an `env` or `context` with a consistent contract address for every run of this test; the value kept changing each time. So I'm going to overwrite it now:
        context.inputs.call_context.contract_address = AztecAddress::from_field(
            0x10f48cd9eff7ae5b209c557c70de2e657ee79166868676b787e9417e19260e04,
        ); // This is an address copied to match the typescript one.

        let storage_slot = 42;
        let note = MockNote::new(1234).contract_address(context.this_address()).build();
        let contract_address = context.this_address();

        // All the values in this test were copied over from `encrypted_log_payload.test.ts`
        let contract_address = AztecAddress::from_field(
            0x10f48cd9eff7ae5b209c557c70de2e657ee79166868676b787e9417e19260e04,
        );

        let plaintext = super::compute_note_plaintext_for_this_strategy(note, storage_slot);

        let eph_sk = 0x1358d15019d4639393d62b97e1588c095957ce74a1c32d6ec7d62fe6705d9538;
        let _ = OracleMock::mock("getRandomField").returns(eph_sk).times(1);

        let randomness = 0x0101010101010101010101010101010101010101010101010101010101010101;
        let _ = OracleMock::mock("getRandomField").returns(randomness).times(1000000);

        let recipient = AztecAddress::from_field(
            0x25afb798ea6d0b8c1618e50fdeafa463059415013d3b7c75d46abf5e242be70c,
        );

        let sender = AztecAddress::from_field(
            0x25afb798ea6d0b8c1618e50fdeafa463059415013d3b7c75d46abf5e242be70c,
        );

        let _ = OracleMock::mock("getIndexedTaggingSecretAsSender").returns([69420, 1337]);

        let _ = OracleMock::mock("incrementAppTaggingSecretIndexAsSender").returns(());

        let payload = super::compute_log(context, note, storage_slot, recipient, sender);

        // The following value was generated by `encrypted_log_payload.test.ts`
        // --> Run the test with AZTEC_GENERATE_TEST_DATA=1 flag to update test data.
        let private_log_payload_from_typescript = [
            0x0e9cffc3ddd746affb02410d8f0a823e89939785bcc8e88ee4f3cae05e737c36,
            0x0d460c0e434d846ec1ea286e4090eb56376ff27bddc1aacae1d856549f701fa7,
            0x000194e6d7872db8f61e8e59f23580f4db45d13677f873ec473a409cf61fd04d,
            0x00334e5fb6083721f3eb4eef500876af3c9acfab0a1cb1804b930606fdb0b283,
            0x00af91db798fa320746831a59b74362dfd0cf9e7c239f6aad11a4b47d0d870ee,
            0x00d25a054613a83be7be8512f2c09664bc4f7ab60a127b06584f476918581b8a,
            0x003840d100d8c1d78d4b68b787ed353ebfb8cd2987503d3b472f614f25799a18,
            0x003f38322629d401010101010101010101010101010101010101010101010101,
            0x0101010101010101010101010101010101010101010101010101010101010101,
            0x0101010101010101010101010101010101010101010101010101010101010101,
            0x0101010101010101010101010101010101010101010101010101010101010101,
            0x0101010101010101010101010101010101010101010101010101010101010101,
            0x0101010101010101010101010101010101010101010101010101010101010101,
            0x0101010101010101010101010101010101010101010101010101010101010101,
            0x0101010101010101010101010101010101010101010101010101010101010101,
            0x0101010101010101010101010101010101010101010101010101010101010101,
            0x0101010101010101010101010101010101010101010101010101010101010101,
            0x0101010101010101010101010101010101010101010101010101010101010101,
        ];

        assert_eq(payload, private_log_payload_from_typescript);
    }
}
