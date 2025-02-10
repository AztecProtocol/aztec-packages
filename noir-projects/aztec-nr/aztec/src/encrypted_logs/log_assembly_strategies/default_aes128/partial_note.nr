// THIS FILE WILL GO AWAY WHEN WE REFACTOR PARTIAL NOTES, SO I DON'T FEEL TOO
// GUILTY ABOUT THE OBVIOUS CODE DUPLICATION VS note.nr & event.nr.

use crate::{
    encrypted_logs::{
        encrypt::aes128::derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_sha256,
        log_assembly_strategies::default_aes128::note::{
            get_arr_of_size__log_bytes_padding__from_plaintext, HEADER_CIPHERTEXT_SIZE_IN_BYTES,
        },
    },
    keys::{
        ecdh_shared_secret::derive_ecdh_shared_secret_using_aztec_address,
        ephemeral::generate_ephemeral_key_pair,
    },
    oracle::notes::{get_app_tag_as_sender, increment_app_tagging_secret_index_as_sender},
    utils::{bytes::{be_bytes_31_to_fields, get_random_bytes}, point::get_sign_of_point},
};
use dep::protocol_types::{
    address::{aztec_address::ToField, AztecAddress},
    hash::poseidon2_hash,
    utils::arrays::{array_concat, array_concat_4},
};
use std::aes128::aes128_encrypt;

pub fn compute_partial_public_log_payload<let N: u32, let M: u32>(
    contract_address: AztecAddress,
    plaintext: [u8; N],
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; M] {
    // *****************************************************************************
    // Compute the shared secret
    // *****************************************************************************

    let (eph_sk, eph_pk) = generate_ephemeral_key_pair();

    let eph_pk_sign_byte: u8 = get_sign_of_point(eph_pk) as u8;

    let ciphertext_shared_secret = derive_ecdh_shared_secret_using_aztec_address(eph_sk, recipient); // not to be confused with the tagging shared secret

    // TODO: also use this shared secret for deriving note randomness.

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

    let ciphertext_bytes = aes128_encrypt(plaintext, iv, sym_key);

    // *****************************************************************************
    // Compute the header ciphertext
    // *****************************************************************************

    let contract_address_bytes = contract_address.to_field().to_be_bytes::<32>();

    let ciphertext_bytes_length = ciphertext_bytes.len();
    // We take the u32 length and convert it to two u8's; i.e. two 8-bit big-endian limbs,
    // So an 8-bit right-shift gives us the big limb (by discarding the little limb).
    // The little limb is got by casting to a u8 (which discards higher bits).
    // The capacity of two u8's is plenty: that allows for 2^16 = 65,536 bytes of
    // ciphertext, which is more than enough space.
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
        get_arr_of_size__log_bytes_padding__from_plaintext(plaintext);
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

    // Silo the tag with contract address.
    // This is done by the kernel circuit to the private logs, but since the partial log will be finalized and emitted
    // in public as unencrypted log, its tag is not siloed at the moment.
    // To avoid querying logs using two types of tags, we silo the tag manually here.
    // TODO(#10273) This should be done by the AVM when it's processing the raw logs instead of their hashes.
    let siloed_tag = poseidon2_hash([contract_address.to_field(), tag]);

    let mut final_log: [Field; M] = [0; M];

    final_log[0] = siloed_tag;
    final_log[1] = eph_pk.x;

    let mut offset = 2;
    for i in 0..log_bytes_as_fields.len() {
        final_log[offset + i] = log_bytes_as_fields[i];
    }

    // Interestingly, this more-succinct version of the above doesn't work:
    // the compiler can't figure out that the concatenation of these fields
    // results in length M.
    // let final_log: [Field; M] = array_concat_3([siloed_tag], [eph_pk.x], log_bytes_as_fields);

    final_log
}
