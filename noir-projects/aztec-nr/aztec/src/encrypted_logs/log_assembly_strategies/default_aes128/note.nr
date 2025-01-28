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
    abis::note_hash::NoteHash,
    address::AztecAddress,
    constants::PRIVATE_LOG_SIZE_IN_FIELDS,
    utils::arrays::{array_concat, array_concat_3, array_concat_4},
};
use std::aes128::aes128_encrypt;

pub(crate) global TAG_SIZE_IN_FIELDS: u32 = 1;
pub(crate) global EPH_PK_X_SIZE_IN_FIELDS: u32 = 1;

pub(crate) global EPH_PK_Y_SIGN_SIZE_IN_BYTES: u32 = 1; // Technically, this only needs to occupy 1 bit, but we fill one byte here, for ease.
pub(crate) global HEADER_CIPHERTEXT_SIZE_IN_BYTES: u32 = 48; // contract_address (32) + ciphertext_length (2) + 16 bytes pkcs#7 AES padding.

pub(crate) global CONTRACT_ADDRESS_SIZE_IN_BYTES: u32 = 32;

// Difficult to name: the number of bytes needed to convey the size (in bytes) of the ciphertext
pub(crate) global SIZE_OF_ENCODING_OF_CIPHERTEXT_SIZE_IN_BYTES: u32 = 2;

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
 * epk: [Field, u8] // the sign of the y-coord occupies that u8.
 * header_ct: [[u8; 32], [u8; 2], [u8; 14]]
 * ct: [[u8; x], [u8; 16 - (x % 16)]]
 * padding_to_mult_31: [u8; p]
 * fields_padding: [Field; whatever's left]
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

// Instantiates an array that can be fed into the subsequent functions, to compute the
// more-complex numeric generics.
fn get_arr_of_size__full_plaintext<let PT: u32>(_plaintext: [u8; PT]) -> [u8; PT] {
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
    // 1 + 48 + CT
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

// The return type is pasted from the LSP's expectation, because it was too difficult
// to match its weird way of doing algebra. It doesn't know all rules of arithmetic.
// PT is the plaintext length.
pub(crate) fn get_arr_of_size__log_bytes_padding__from_plaintext<let PT: u32>(
    plaintext: [u8; PT],
) -> [u8; ((((((PT + (16 - (PT % 16))) + 49) + 30) / 31) * 31) - ((PT + (16 - (PT % 16))) + 49))] {
    let full_pt = get_arr_of_size__full_plaintext(plaintext);
    let pt_aes_padding = get_arr_of_size__plaintext_aes_padding(full_pt);
    let ct = get_arr_of_size__ciphertext(full_pt, pt_aes_padding);
    let lbwop = get_arr_of_size__log_bytes_without_padding(ct);
    let p = get_arr_of_size__log_bytes_padding(lbwop);
    p
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
fn compute_note_plaintext_for_this_strategy<Note, let N: u32>(note: Note) -> [u8; N * 32 + 64]
where
    Note: NoteInterface<N>,
{
    let serialized_note = note.serialize_content();

    let note_header = note.get_header();
    let storage_slot = note_header.storage_slot;
    let storage_slot_bytes: [u8; 32] = storage_slot.to_be_bytes();

    // TODO(#10952): The following can be reduced to 7 bits
    let note_type_id_bytes: [u8; 32] = Note::get_note_type_id().to_be_bytes();

    // We combine all the bytes into plaintext_bytes:
    let mut plaintext_bytes: [u8; N * 32 + 64] = [0; N * 32 + 64];
    for i in 0..32 {
        plaintext_bytes[i] = storage_slot_bytes[i];
        plaintext_bytes[32 + i] = note_type_id_bytes[i];
    }

    for i in 0..serialized_note.len() {
        let bytes: [u8; 32] = serialized_note[i].to_be_bytes();
        for j in 0..32 {
            plaintext_bytes[64 + i * 32 + j] = bytes[j];
        }
    }

    plaintext_bytes
}

fn compute_log<Note, let N: u32>(
    context: PrivateContext,
    note: Note,
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

    let final_plaintext_bytes = compute_note_plaintext_for_this_strategy(note);

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

    // *****************************************************************************
    // Compute the header ciphertext
    // *****************************************************************************

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
        get_arr_of_size__log_bytes_padding__from_plaintext(final_plaintext_bytes);
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

    /// Safety: We assume that the sender wants for the recipient to find the tagged note,
    /// and therefore that they will cooperate and use the correct tag. Usage of a bad
    /// tag will result in the recipient not being able to find the note automatically.
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

unconstrained fn compute_log_unconstrained<Note, let N: u32>(
    context: PrivateContext,
    note: Note,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Note: NoteInterface<N>,
{
    compute_log(context, note, recipient, sender)
}

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
        assert_note_exists(*context, note);

        let note_hash_counter = note.get_header().note_hash_counter;

        let encrypted_log = compute_log(*context, note, recipient, sender);
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
        let encrypted_log = unsafe { compute_log_unconstrained(*context, note, recipient, sender) };
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
        let note = MockNote::new(1234)
            .contract_address(context.this_address())
            .storage_slot(storage_slot)
            .build();
        let contract_address = context.this_address();

        // All the values in this test were copied over from `encrypted_log_payload.test.ts`
        let contract_address = AztecAddress::from_field(
            0x10f48cd9eff7ae5b209c557c70de2e657ee79166868676b787e9417e19260e04,
        );

        let plaintext = super::compute_note_plaintext_for_this_strategy(note);

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

        let payload = super::compute_log(context, note, recipient, sender);

        // The following value was generated by `encrypted_log_payload.test.ts`
        // --> Run the test with AZTEC_GENERATE_TEST_DATA=1 flag to update test data.
        let private_log_payload_from_typescript = [
            0x0e9cffc3ddd746affb02410d8f0a823e89939785bcc8e88ee4f3cae05e737c36,
            0x0d460c0e434d846ec1ea286e4090eb56376ff27bddc1aacae1d856549f701fa7,
            0x00010577790aeabcc2d81ec8d0c99e7f5d2bf2f1452025dc777a178404f851d9,
            0x003de81cde78411f27a921e16ebbfba71a5570d3f62f1134c90daced33663ba0,
            0x00856cb19c7d563da183a40a6f8bd4988d1696ad6bf0c717c8fb8f6294bd0366,
            0x001ed04e4f77a111c7090fcd34c61cfae744e8589a42defba4d0d927dd4679fe,
            0x00ec09b49d8d4cf548ea62d44c8839b2fd14664e9d1439b199a8d5166e362348,
            0x004a69de2d410e01010101010101010101010101010101010101010101010101,
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
