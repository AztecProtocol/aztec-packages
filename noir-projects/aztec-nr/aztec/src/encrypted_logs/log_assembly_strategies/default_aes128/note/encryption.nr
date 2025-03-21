use crate::{
    encrypted_logs::{
        encrypt::aes128::derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_sha256,
        log_assembly_strategies::default_aes128::arithmetic_generics_utils::{
            get_arr_of_size__log_bytes__from_PT, get_arr_of_size__log_bytes_padding__from_PT,
        },
    },
    keys::{
        ecdh_shared_secret::derive_ecdh_shared_secret_using_aztec_address,
        ephemeral::generate_ephemeral_key_pair,
    },
    oracle::{
        aes128_decrypt::aes128_decrypt_oracle,
        notes::{get_app_tag_as_sender, increment_app_tagging_secret_index_as_sender},
        shared_secret::get_shared_secret,
    },
    utils::{
        array,
        conversion::{
            bytes_to_fields::{bytes_from_fields, bytes_to_fields},
            fields_to_bytes::{fields_from_bytes, fields_to_bytes},
        },
        point::{get_sign_of_point, point_from_x_coord_and_sign},
        random::get_random_bytes,
    },
};
use protocol_types::{address::AztecAddress, constants::PRIVATE_LOG_SIZE_IN_FIELDS, traits::ToField};
use std::aes128::aes128_encrypt;

// contract_address (32) + ciphertext_length (2) + 16 bytes pkcs#7 AES padding.
pub(crate) global HEADER_CIPHERTEXT_SIZE_IN_BYTES: u32 = 48;

global TAG_AND_EPH_PK_X_SIZE_IN_FIELDS: u32 = 2;
global EPH_PK_SIGN_BYTE_SIZE_IN_BYTES: u32 = 1;
pub global PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES: u32 = (
    PRIVATE_LOG_SIZE_IN_FIELDS - TAG_AND_EPH_PK_X_SIZE_IN_FIELDS
)
    * 31
    - HEADER_CIPHERTEXT_SIZE_IN_BYTES
    - EPH_PK_SIGN_BYTE_SIZE_IN_BYTES;
// Each field of the original note log was serialized to 32 bytes. Below we convert the bytes back to fields.
pub global PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS: u32 = PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES / 32;

/// Computes an encrypted log using AES-128 encryption in CBC mode.
///
/// The resulting log has the following format:
/// ```text
/// [
///   tag: Field,                    // Tag for message discovery, derived from sender/recipient
///   epk_x: Field,                  // X coordinate of ephemeral public key
///   log_bytes: [Field],            // Encrypted data converted from bytes to fields, containing:
///     [
///       epk_sign: u8,              // Sign bit of ephemeral public key Y coordinate
///       header_ciphertext: [u8],   // AES encrypted header containing:
///         [
///           contract_address: [u8; 32],  // Contract address that emitted the note
///           ciphertext_length: [u8; 2],  // Length of main ciphertext in bytes
///           padding: [u8; 14]            // PKCS#7 padding to AES block size
///         ],
///       ciphertext: [u8],          // AES encrypted note data containing:
///         [
///           plaintext_bytes: [u8],       // The plaintext
///           padding: [u8]                // PKCS#7 padding to AES block size
///         ],
///       padding: [u8]              // Random padding to make log_bytes multiple of 31
///     ],
///   padding: [Field]               // Random padding to PRIVATE_LOG_SIZE_IN_FIELDS
/// ]
/// ```
///
/// The encryption process:
/// 1. Generate ephemeral key-pair and ECDH shared secret with recipient
/// 2. Derive AES key and IV from shared secret using SHA-256
/// 3. Encrypt header and note data separately using AES-128-CBC
/// 4. Format into final log structure with padding
pub fn encrypt_log<let PT: u32>(
    contract_address: AztecAddress,
    plaintext: [Field; PT],
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS] {
    // AES 128 operates on bytes, not fields, so we need to convert the fields to bytes.
    // (This process is then reversed when processing the log in `do_process_log`)
    let plaintext_bytes = fields_to_bytes(plaintext);

    // *****************************************************************************
    // Compute the shared secret
    // *****************************************************************************

    let (eph_sk, eph_pk) = generate_ephemeral_key_pair();

    let eph_pk_sign_byte: u8 = get_sign_of_point(eph_pk) as u8;

    // (not to be confused with the tagging shared secret)
    let ciphertext_shared_secret = derive_ecdh_shared_secret_using_aztec_address(eph_sk, recipient);

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

    let ciphertext_bytes = aes128_encrypt(plaintext_bytes, iv, sym_key);

    // |full_pt| = |pt_length| + |pt|
    // |pt_aes_padding| = 16 - (|full_pt| % 16)
    // or... since a % b is the same as a - b * (a // b) (integer division), so:
    // |pt_aes_padding| = 16 - (|full_pt| - 16 * (|full_pt| // 16))
    // |ct| = |full_pt| + |pt_aes_padding|
    //      = |full_pt| + 16 - (|full_pt| - 16 * (|full_pt| // 16))
    //      = 16 + 16 * (|full_pt| // 16)
    //      = 16 * (1 + |full_pt| // 16)
    assert(ciphertext_bytes.len() == 16 * (1 + (PT * 32) / 16));

    // *****************************************************************************
    // Compute the header ciphertext
    // *****************************************************************************

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

    let mut log_bytes_padding_to_mult_31 = get_arr_of_size__log_bytes_padding__from_PT::<PT * 32>();
    // Safety: this randomness won't be constrained to be random. It's in the
    // interest of the executor of this fn to encrypt with random bytes.
    log_bytes_padding_to_mult_31 = unsafe { get_random_bytes() };

    let mut log_bytes = get_arr_of_size__log_bytes__from_PT::<PT * 32>();

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

    // TODO(#12749): As Mike pointed out, we need to make logs produced by different encryption schemes
    // indistinguishable from each other and for this reason the output here and in the last for-loop of this function
    // should cover a full field.
    let log_bytes_as_fields = bytes_to_fields(log_bytes);

    // *****************************************************************************
    // Prepend / append fields, to create the final log
    // *****************************************************************************

    // In this strategy, we prepend [tag, eph_pk.x]

    // Safety: We assume that the sender wants for the recipient to find the tagged note,
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

pub unconstrained fn decrypt_log(
    log: BoundedVec<Field, PRIVATE_LOG_SIZE_IN_FIELDS>,
    recipient: AztecAddress,
) -> BoundedVec<Field, PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS> {
    // let tag = log.get(0);
    let eph_pk_x = log.get(1);

    let log_ciphertext_fields = array::subbvec::<Field, PRIVATE_LOG_SIZE_IN_FIELDS, PRIVATE_LOG_SIZE_IN_FIELDS - TAG_AND_EPH_PK_X_SIZE_IN_FIELDS>(
        log,
        TAG_AND_EPH_PK_X_SIZE_IN_FIELDS,
    );

    // Convert the ciphertext represented as fields to a byte representation (its original format)
    let log_ciphertext = bytes_from_fields(log_ciphertext_fields);

    // First byte of the ciphertext represents the ephemeral public key sign
    let eph_pk_sign_bool = log_ciphertext.get(0) as bool;
    // With the sign and the x-coordinate of the ephemeral public key, we can reconstruct the point
    let eph_pk = point_from_x_coord_and_sign(eph_pk_x, eph_pk_sign_bool);

    // Derive shared secret and symmetric key
    let ciphertext_shared_secret = get_shared_secret(recipient, eph_pk);
    let (sym_key, iv) = derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_sha256(
        ciphertext_shared_secret,
    );

    // Extract the header ciphertext
    let header_start = EPH_PK_SIGN_BYTE_SIZE_IN_BYTES; // Skip eph_pk_sign byte
    let header_ciphertext: [u8; HEADER_CIPHERTEXT_SIZE_IN_BYTES] =
        array::subarray(log_ciphertext.storage(), header_start);
    // We need to convert the array to a BoundedVec because the oracle expects a BoundedVec as it's designed to work
    // with logs with unknown length at compile time. This would not be necessary here as the header ciphertext length
    // is fixed. But we do it anyway to not have to have duplicate oracles.
    let header_ciphertext_bvec =
        BoundedVec::<u8, HEADER_CIPHERTEXT_SIZE_IN_BYTES>::from_array(header_ciphertext);

    // Decrypt header
    let header_plaintext = aes128_decrypt_oracle(header_ciphertext_bvec, iv, sym_key);

    // Extract ciphertext length from header (2 bytes, big-endian)
    let ciphertext_length =
        ((header_plaintext.get(32) as u32) << 8) | (header_plaintext.get(33) as u32);

    // Extract and decrypt main ciphertext
    let ciphertext_start = header_start + HEADER_CIPHERTEXT_SIZE_IN_BYTES;
    let ciphertext_with_padding: [u8; (PRIVATE_LOG_SIZE_IN_FIELDS - TAG_AND_EPH_PK_X_SIZE_IN_FIELDS) * 31 - HEADER_CIPHERTEXT_SIZE_IN_BYTES - EPH_PK_SIGN_BYTE_SIZE_IN_BYTES] =
        array::subarray(log_ciphertext.storage(), ciphertext_start);
    let ciphertext: BoundedVec<u8, (PRIVATE_LOG_SIZE_IN_FIELDS - TAG_AND_EPH_PK_X_SIZE_IN_FIELDS) * 31 - HEADER_CIPHERTEXT_SIZE_IN_BYTES - EPH_PK_SIGN_BYTE_SIZE_IN_BYTES> =
        BoundedVec::from_parts(ciphertext_with_padding, ciphertext_length);

    // Decrypt main ciphertext and return it
    let log_plaintext_bytes = aes128_decrypt_oracle(ciphertext, iv, sym_key);

    // Each field of the original note log was serialized to 32 bytes so we convert the bytes back to fields.
    fields_from_bytes(log_plaintext_bytes)
}

mod test {
    use crate::{
        keys::ecdh_shared_secret::derive_ecdh_shared_secret_using_aztec_address,
        test::helpers::test_environment::TestEnvironment,
    };
    use super::{decrypt_log, encrypt_log, PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS};
    use protocol_types::{address::AztecAddress, traits::FromField};
    use std::{embedded_curve_ops::EmbeddedCurveScalar, test::OracleMock};

    #[test]
    unconstrained fn encrypt_decrypt_log() {
        let mut env = TestEnvironment::new();
        // Advance 1 block so we can read historic state from private
        env.advance_block_by(1);

        let contract_address = AztecAddress::from_field(
            0x10f48cd9eff7ae5b209c557c70de2e657ee79166868676b787e9417e19260e04,
        );

        let plaintext = [1, 2, 3];

        let recipient = AztecAddress::from_field(
            0x25afb798ea6d0b8c1618e50fdeafa463059415013d3b7c75d46abf5e242be70c,
        );

        let sender = AztecAddress::from_field(
            0x25afb798ea6d0b8c1618e50fdeafa463059415013d3b7c75d46abf5e242be70c,
        );

        // Mock random values for deterministic test
        let eph_sk = 0x1358d15019d4639393d62b97e1588c095957ce74a1c32d6ec7d62fe6705d9538;
        let _ = OracleMock::mock("getRandomField").returns(eph_sk).times(1);

        let randomness = 0x0101010101010101010101010101010101010101010101010101010101010101;
        let _ = OracleMock::mock("getRandomField").returns(randomness).times(1000000);

        let _ = OracleMock::mock("getIndexedTaggingSecretAsSender").returns([69420, 1337]);
        let _ = OracleMock::mock("incrementAppTaggingSecretIndexAsSender").returns(());

        // Encrypt the log
        let encrypted_log =
            BoundedVec::from_array(encrypt_log(contract_address, plaintext, recipient, sender));

        // Mock shared secret for deterministic test
        let shared_secret = derive_ecdh_shared_secret_using_aztec_address(
            EmbeddedCurveScalar::from_field(eph_sk),
            recipient,
        );
        let _ = OracleMock::mock("getSharedSecret").returns(shared_secret);

        // Decrypt the log
        let decrypted = decrypt_log(encrypted_log, recipient);

        // The decryption function spits out a BoundedVec because it's designed to work with logs with unknown length
        // at compile time. For this reason we need to convert the original input to a BoundedVec.
        let plaintext_bvec =
            BoundedVec::<Field, PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS>::from_array(plaintext);

        // Verify decryption matches original plaintext
        assert_eq(decrypted, plaintext_bvec, "Decrypted bytes should match original plaintext");
    }
}
