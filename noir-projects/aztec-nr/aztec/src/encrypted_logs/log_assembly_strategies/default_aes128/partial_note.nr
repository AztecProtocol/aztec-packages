// THIS FILE WILL GO AWAY WHEN WE REFACTOR PARTIAL NOTES, SO I DON'T FEEL TOO
// GUILTY ABOUT THE OBVIOUS CODE DUPLICATION VS note.nr & event.nr.

use crate::{
    encrypted_logs::{
        encrypt::aes128::derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_sha256,
        log_assembly_strategies::default_aes128::note::{
            get_arr_of_size_fields_padding_from_PT, get_arr_of_size_log_bytes_from_PT,
            get_arr_of_size_p_from_PT, HEADER_CIPHERTEXT_SIZE_IN_BYTES,
        },
    },
    keys::{
        ecdh_shared_secret::derive_ecdh_shared_secret_using_aztec_address,
        ephemeral::generate_ephemeral_key_pair,
    },
    oracle::{
        notes::{get_app_tag_as_sender, increment_app_tagging_secret_index_as_sender},
        random::random,
    },
    utils::{
        bytes::{be_bytes_31_to_fields, get_random_bytes},
        point::{get_sign_of_point, point_to_bytes},
    },
};
use dep::protocol_types::{
    address::{aztec_address::ToField, AztecAddress},
    debug_log::{debug_log, debug_log_format},
    hash::poseidon2_hash,
};
use std::aes128::aes128_encrypt;

pub fn compute_partial_public_log_payload<let N: u32, let M: u32>(
    contract_address: AztecAddress,
    plaintext: [u8; N],
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; M] {
    debug_log("I'm in partial_note.nr");

    // *****************************************************************************
    // Compute the shared secret
    // *****************************************************************************

    let (eph_sk, eph_pk) = generate_ephemeral_key_pair();

    let eph_pk_sign_byte: u8 = get_sign_of_point(eph_pk) as u8;

    let ciphertext_shared_secret = derive_ecdh_shared_secret_using_aztec_address(eph_sk, recipient); // not to be confused with the tagging shared secret

    // TODO: also use this shared secret for deriving note randomness.

    // *****************************************************************************
    // Prepend/append extra bytes
    // *****************************************************************************

    // "Proper" meaning the main meaty stuff that we care about.
    let proper_plaintext: [u8; N] = plaintext;
    let final_plaintext = proper_plaintext;

    // *****************************************************************************
    // Convert the plaintext into whatever format the encryption function expects
    // *****************************************************************************

    // Already done for this strategy: AES expects bytes.

    // *****************************************************************************
    // Encrypt
    // *****************************************************************************

    let (sym_key, iv) = derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_sha256(
        ciphertext_shared_secret,
    );

    let ciphertext_bytes = aes128_encrypt(final_plaintext, iv, sym_key);

    assert(ciphertext_bytes.len() == 16 * (1 + (2 + N) / 16));

    // *****************************************************************************
    // Compute the header ciphertext
    // *****************************************************************************

    let contract_address_bytes = contract_address.to_field().to_be_bytes::<32>();

    let mut header_plaintext: [u8; 32 + 2] = [0; 32 + 2];
    for i in 0..32 {
        header_plaintext[i] = contract_address_bytes[i];
    }
    let offset = contract_address_bytes.len();

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

    let mut log_bytes_padding_to_mult_31 = get_arr_of_size_p_from_PT::<2 + N>();
    log_bytes_padding_to_mult_31 = unsafe { get_random_bytes() };

    let mut log_bytes = get_arr_of_size_log_bytes_from_PT::<2 + N>();

    // LOGGGINGGGGG

    let contract_address_bytes_length = contract_address_bytes.len() as Field;
    let header_plaintext_length = header_plaintext.len() as Field;
    let header_ciphertext_bytes_length = header_ciphertext_bytes.len() as Field;
    let plaintext_length = plaintext.len() as Field;
    let log_bytes_padding_to_mult_31_length = log_bytes_padding_to_mult_31.len() as Field;
    let log_bytes_length = log_bytes.len() as Field;
    debug_log("\n\n\n\nHELLO");
    debug_log("Hi Mum!");
    debug_log("I'm in partial_note.nr");
    debug_log_format(
        "\ncontract_address_bytes_length: {0}",
        [contract_address_bytes_length],
    );
    debug_log_format("\nheader_plaintext_length: {0}", [header_plaintext_length]);
    debug_log_format(
        "\nheader_ciphertext_bytes_length: {0}",
        [header_ciphertext_bytes_length],
    );
    debug_log_format(
        "\nciphertext_bytes_length: {0}",
        [ciphertext_bytes_length as Field],
    );
    debug_log_format("\nplaintext_length: {0}", [plaintext_length]);
    debug_log_format(
        "\nlog_bytes_padding_to_mult_31_length: {0}",
        [log_bytes_padding_to_mult_31_length],
    );
    debug_log_format("\nlog_bytes_length: {0}", [log_bytes_length]);
    debug_log_format("\ncontract_address: {0}", [contract_address.to_field()]);
    debug_log_format(
        "header_plaintext: {}",
        header_plaintext.map(|byte| byte as Field),
    );
    debug_log_format(
        "final_plaintext: {}",
        final_plaintext.map(|byte| byte as Field),
    );
    debug_log_format(
        "final_plaintext, attempt to convert the bytes to fields: {}",
        be_bytes_31_to_fields(final_plaintext),
    );
    debug_log_format(
        "header_ciphertext_bytes: {}",
        header_ciphertext_bytes.map(|byte| byte as Field),
    );
    debug_log_format(
        "header_ciphertext_bytes, attempt to convert the bytes to fields: {}",
        be_bytes_31_to_fields(header_ciphertext_bytes),
    );

    debug_log_format(
        "ciphertext_bytes: {}",
        ciphertext_bytes.map(|byte| byte as Field),
    );
    debug_log_format(
        "ciphertext_bytes, attempt to convert the bytes to fields: {}",
        be_bytes_31_to_fields(ciphertext_bytes),
    );
    debug_log_format("eph_pk: \nx: {0} \ny: {1}", [eph_pk.x, eph_pk.y]);
    debug_log_format(
        "ciphertext_shared_secret: \nx: {0} \ny: {1}",
        [ciphertext_shared_secret.x, ciphertext_shared_secret.y],
    );
    debug_log_format("sym_key: {0}", be_bytes_31_to_fields(sym_key));

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

    debug_log("\nMade the log_bytes successfully...");

    // *****************************************************************************
    // Convert bytes back to fields
    // *****************************************************************************

    let log_bytes_as_fields = be_bytes_31_to_fields(log_bytes);

    // *****************************************************************************
    // Prepend / append fields, to create the final log
    // *****************************************************************************

    // We don't add any extra random padding.
    // Whilst we do this in note.nr, we won't do it for this partial_note log, because it's going to get stored in public, and so:
    // - The nature of the tx is going to be leaked.
    // - We therefore don't care if it's padded to obscure the length of the actual ciphertext.
    // Note: partial logs are going to be greatly refactored, soon.

    // We assume that the sender wants for the recipient to find the tagged note, and therefore that they will cooperate
    // and use the correct tag. Usage of a bad tag will result in the recipient not being able to find the note
    // automatically.
    let tag = unsafe { get_app_tag_as_sender(sender, recipient) };
    increment_app_tagging_secret_index_as_sender(sender, recipient);

    debug_log_format("tag: {0}", [tag]);

    // Silo the tag with contract address.
    // This is done by the kernel circuit to the private logs, but since the partial log will be finalized and emitted
    // in public as unencrypted log, its tag is not siloed at the moment.
    // To avoid querying logs using two types of tags, we silo the tag manually here.
    // TODO(#10273) This should be done by the AVM when it's processing the raw logs instead of their hashes.
    let siloed_tag = poseidon2_hash([contract_address.to_field(), tag]);

    // Temporary hack so that the partial public log remains the same format.
    // It should return field array and make the tag the first field as compute_private_log_payload does.

    let mut final_log: [Field; M] = [0; M];

    final_log[0] = siloed_tag;
    final_log[1] = eph_pk.x;

    debug_log_format("final_log length: {0}", [M as Field]);
    let length_should_be = 1 + 1 + log_bytes_as_fields.len();
    debug_log_format("length should be: {0}", [length_should_be as Field]);

    debug_log("\nAbout to make the final_log...");

    let mut offset = 2;
    for i in 0..log_bytes_as_fields.len() {
        final_log[offset + i] = log_bytes_as_fields[i];
    }

    final_log
}
