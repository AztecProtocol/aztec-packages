use dep::protocol_types::{
    address::AztecAddress,
    constants::{
        GENERATOR_INDEX__SYMMETRIC_KEY, GENERATOR_INDEX__SYMMETRIC_KEY_2,
        PRIVATE_LOG_CIPHERTEXT_LEN,
    },
    hash::poseidon2_hash_with_separator,
    point::Point,
};

use crate::{
    keys::{
        ecdh_shared_secret::derive_ecdh_shared_secret_using_aztec_address,
        ephemeral::generate_ephemeral_key_pair,
    },
    messages::{
        encryption::log_encryption::{
            EPH_PK_SIGN_BYTE_SIZE_IN_BYTES, EPH_PK_X_SIZE_IN_FIELDS,
            HEADER_CIPHERTEXT_SIZE_IN_BYTES, LogEncryption, PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS,
        },
        logs::arithmetic_generics_utils::{
            get_arr_of_size__log_bytes__from_PT, get_arr_of_size__log_bytes_padding__from_PT,
        },
    },
    oracle::{aes128_decrypt::aes128_decrypt_oracle, shared_secret::get_shared_secret},
    utils::{
        array,
        conversion::{
            bytes_to_fields::{bytes_from_fields, bytes_to_fields},
            fields_to_bytes::{fields_from_bytes, fields_to_bytes},
        },
        point::{get_sign_of_point, point_from_x_coord_and_sign, point_to_bytes},
        random::get_random_bytes,
    },
};

use std::aes128::aes128_encrypt;

/** Computes a close-to-uniformly-random 256 bits from a given ECDH shared_secret.
 * This function is only known to be safe if shared_secret is computed by combining a 
 * random ephemeral key with an address point. See big comment within the body of the function.
 */
fn extract_close_to_uniformly_random_256_bits_from_ecdh_shared_secret_using_poseidon2_unsafe(
    shared_secret: Point,
) -> [u8; 32] {
    /*
     * Unsafe because of https://eprint.iacr.org/2010/264.pdf Page 13, Lemma 2 (and the * two paragraphs below it).
     *
     * If you call this function, you need to be careful and aware of how the arg
     * `shared_secret` has been derived.
     *
     * The paper says that the way you derive aes keys and IVs should be fine with poseidon2
     * (modelled as a RO), as long as you _don't_ use Poseidon2 as a PRG to generate the * two exponents x & y which multiply to the shared secret S:
     *
     * S = [x*y]*G.
     *
     * (Otherwise, you would have to "key" poseidon2, i.e. generate a uniformly string K
     * which can be public and compute Hash(x) as poseidon(K,x)).
     * In that lemma, k would be 2*254=508, and m would be the number of points on the * grumpkin curve (which is close to r according to the Hasse bound).
     *
     * Our shared secret S is [esk * address_sk] * G, and the question is: * Can we compute hash(S) using poseidon2 instead of sha256?
     *
     * Well, esk is random and not generated with poseidon2, so that's good.
     * What about address_sk?
     * Well, address_sk = poseidon2(stuff) + ivsk, so there was some
     * discussion about whether address_sk is independent of poseidon2.
     * Given that ivsk is random and independent of poseidon2, the address_sk is also
     * independent of poseidon2.
     *
     * Tl;dr: we believe it's safe to hash S = [esk * address_sk] * G using poseidon2,
     * in order to derive a symmetric key.
     *
     * If you're calling this function for a differently-derived `shared_secret`, be
     * careful.
     *
     */

    /* The output of this function needs to be 32 random bytes.
     * A single field won't give us 32 bytes of entropy.
     * So we compute two "random" fields, by poseidon-hashing with two different
     * generators.
     * We then extract the last 16 (big endian) bytes of each "random" field.
     * Note: we use to_be_bytes because it's slightly more efficient. But we have to
     * be careful not to take bytes from the "big end", because the "big" byte is
     * not uniformly random over the byte: it only has < 6 bits of randomness, because
     * it's the big end of a 254-bit field element.
     */

    let rand1: Field = poseidon2_hash_with_separator(
        [shared_secret.x, shared_secret.y],
        GENERATOR_INDEX__SYMMETRIC_KEY,
    );
    let rand2: Field = poseidon2_hash_with_separator(
        [shared_secret.x, shared_secret.y],
        GENERATOR_INDEX__SYMMETRIC_KEY_2,
    );

    let rand1_bytes: [u8; 32] = rand1.to_be_bytes();
    let rand2_bytes: [u8; 32] = rand2.to_be_bytes();

    let mut bytes: [u8; 32] = [0; 32];
    for i in 0..16 {
        // We take bytes from the "little end" of the be-bytes arrays:
        let j = 32 - i - 1;
        bytes[i] = rand1_bytes[j];
        bytes[16 + i] = rand2_bytes[j];
    }

    bytes
}


fn derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret(
    shared_secret: Point,
    randomness_extraction_fn: fn(Point) -> [u8; 32],
) -> ([u8; 16], [u8; 16]) {
    let random_256_bits = randomness_extraction_fn(shared_secret);
    let mut sym_key = [0; 16];
    let mut iv = [0; 16];
    for i in 0..16 {
        sym_key[i] = random_256_bits[i];
        iv[i] = random_256_bits[i + 16];
    }
    (sym_key, iv)
}

pub fn derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_poseidon2_unsafe(
    shared_secret: Point,
) -> ([u8; 16], [u8; 16]) {
    derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret(
        shared_secret,
        extract_close_to_uniformly_random_256_bits_from_ecdh_shared_secret_using_poseidon2_unsafe,
    )
}

pub struct AES128 {}

impl LogEncryption for AES128 {
    fn encrypt_log<let PLAINTEXT_LEN: u32>(
        plaintext: [Field; PLAINTEXT_LEN],
        recipient: AztecAddress,
    ) -> [Field; PRIVATE_LOG_CIPHERTEXT_LEN] {
        // AES 128 operates on bytes, not fields, so we need to convert the fields to bytes.
        // (This process is then reversed when processing the log in `do_process_log`)
        let plaintext_bytes = fields_to_bytes(plaintext);

        // *****************************************************************************
        // Compute the shared secret
        // *****************************************************************************

        let (eph_sk, eph_pk) = generate_ephemeral_key_pair();

        let eph_pk_sign_byte: u8 = get_sign_of_point(eph_pk) as u8;

        // (not to be confused with the tagging shared secret)
        let ciphertext_shared_secret =
            derive_ecdh_shared_secret_using_aztec_address(eph_sk, recipient);
        // TODO: also use this shared secret for deriving note randomness.

        // *****************************************************************************
        // Convert the plaintext into whatever format the encryption function expects
        // *****************************************************************************

        // Already done for this strategy: AES expects bytes.

        // *****************************************************************************
        // Encrypt the plaintext
        // *****************************************************************************

        // It is safe to call the `unsafe` function here, because we know the `shared_secret`
        // was derived using an AztecAddress (the recipient). See the block comment
        // at the start of this unsafe target function for more info.
        let (sym_key, iv) = derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_poseidon2_unsafe(
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
        assert(ciphertext_bytes.len() == 16 * (1 + (PLAINTEXT_LEN * 32) / 16));

        // *****************************************************************************
        // Compute the header ciphertext
        // *****************************************************************************

        // Header contains only the length of the ciphertext stored in 2 bytes.
        let mut header_plaintext: [u8; 2] = [0 as u8; 2];
        let ciphertext_bytes_length = ciphertext_bytes.len();
        header_plaintext[0] = (ciphertext_bytes_length >> 8) as u8;
        header_plaintext[1] = ciphertext_bytes_length as u8;

        // TODO(#14010): this is insecure and wasteful:
        // "Insecure", because the esk shouldn't be used twice (once for the header,
        // and again for the proper ciphertext) (at least, I never got the
        // "go ahead" that this would be safe, unfortunately).
        // "Wasteful", because the exact same computation is happening further down.
        // I'm leaving that 2nd computation where it is, because this 1st computation
        // will be imminently deleted, when the header logic is deleted.
        let (sym_key, iv) = derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_poseidon2_unsafe(
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
            get_arr_of_size__log_bytes_padding__from_PT::<PLAINTEXT_LEN * 32>();
        // Safety: this randomness won't be constrained to be random. It's in the
        // interest of the executor of this fn to encrypt with random bytes.
        log_bytes_padding_to_mult_31 = unsafe { get_random_bytes() };

        let mut log_bytes = get_arr_of_size__log_bytes__from_PT::<PLAINTEXT_LEN * 32>();

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

        let mut ciphertext: [Field; PRIVATE_LOG_CIPHERTEXT_LEN] = [0; PRIVATE_LOG_CIPHERTEXT_LEN];

        ciphertext[0] = eph_pk.x;

        let mut offset = 1;
        for i in 0..log_bytes_as_fields.len() {
            ciphertext[offset + i] = log_bytes_as_fields[i];
        }
        offset += log_bytes_as_fields.len();

        for i in offset..PRIVATE_LOG_CIPHERTEXT_LEN {
            // We need to get a random value that fits in 31 bytes to not leak information about the size of the log
            // (all the "real" log fields contain at most 31 bytes because of the way we convert the bytes to fields).
            // TODO(#12749): Long term, this is not a good solution.

            // Safety: we assume that the sender wants for the log to be private - a malicious one could simply reveal its
            // contents publicly. It is therefore fine to trust the sender to provide random padding.
            let field_bytes = unsafe { get_random_bytes::<31>() };
            ciphertext[i] = Field::from_be_bytes::<31>(field_bytes);
        }

        ciphertext
    }

    unconstrained fn decrypt_log(
        ciphertext: BoundedVec<Field, PRIVATE_LOG_CIPHERTEXT_LEN>,
        recipient: AztecAddress,
    ) -> BoundedVec<Field, PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS> {
        let eph_pk_x = ciphertext.get(0);

        let ciphertext_without_eph_pk_x_fields = array::subbvec::<Field, PRIVATE_LOG_CIPHERTEXT_LEN, PRIVATE_LOG_CIPHERTEXT_LEN - EPH_PK_X_SIZE_IN_FIELDS>(
            ciphertext,
            EPH_PK_X_SIZE_IN_FIELDS,
        );

        // Convert the ciphertext represented as fields to a byte representation (its original format)
        let ciphertext_without_eph_pk_x = bytes_from_fields(ciphertext_without_eph_pk_x_fields);

        // First byte of the ciphertext represents the ephemeral public key sign
        let eph_pk_sign_bool = ciphertext_without_eph_pk_x.get(0) != 0;
        // With the sign and the x-coordinate of the ephemeral public key, we can reconstruct the point
        let eph_pk = point_from_x_coord_and_sign(eph_pk_x, eph_pk_sign_bool);

        // Derive shared secret and symmetric key
        let ciphertext_shared_secret = get_shared_secret(recipient, eph_pk);
        let (sym_key, iv) = derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_poseidon2_unsafe(
            ciphertext_shared_secret,
        );

        // Extract the header ciphertext
        let header_start = EPH_PK_SIGN_BYTE_SIZE_IN_BYTES; // Skip eph_pk_sign byte
        let header_ciphertext: [u8; HEADER_CIPHERTEXT_SIZE_IN_BYTES] =
            array::subarray(ciphertext_without_eph_pk_x.storage(), header_start);
        // We need to convert the array to a BoundedVec because the oracle expects a BoundedVec as it's designed to work
        // with logs with unknown length at compile time. This would not be necessary here as the header ciphertext length
        // is fixed. But we do it anyway to not have to have duplicate oracles.
        let header_ciphertext_bvec =
            BoundedVec::<u8, HEADER_CIPHERTEXT_SIZE_IN_BYTES>::from_array(header_ciphertext);

        // Decrypt header
        let header_plaintext = aes128_decrypt_oracle(header_ciphertext_bvec, iv, sym_key);

        // Extract ciphertext length from header (2 bytes, big-endian)
        let ciphertext_length =
            ((header_plaintext.get(0) as u32) << 8) | (header_plaintext.get(1) as u32);

        // Extract and decrypt main ciphertext
        let ciphertext_start = header_start + HEADER_CIPHERTEXT_SIZE_IN_BYTES;
        let ciphertext_with_padding: [u8; (PRIVATE_LOG_CIPHERTEXT_LEN - EPH_PK_X_SIZE_IN_FIELDS) * 31 - HEADER_CIPHERTEXT_SIZE_IN_BYTES - EPH_PK_SIGN_BYTE_SIZE_IN_BYTES] =
            array::subarray(ciphertext_without_eph_pk_x.storage(), ciphertext_start);
        let ciphertext: BoundedVec<u8, (PRIVATE_LOG_CIPHERTEXT_LEN - EPH_PK_X_SIZE_IN_FIELDS) * 31 - HEADER_CIPHERTEXT_SIZE_IN_BYTES - EPH_PK_SIGN_BYTE_SIZE_IN_BYTES> =
            BoundedVec::from_parts(ciphertext_with_padding, ciphertext_length);

        // Decrypt main ciphertext and return it
        let plaintext_bytes = aes128_decrypt_oracle(ciphertext, iv, sym_key);

        // Each field of the original note log was serialized to 32 bytes so we convert the bytes back to fields.
        fields_from_bytes(plaintext_bytes)
    }
}

mod test {
    use crate::{
        keys::ecdh_shared_secret::derive_ecdh_shared_secret_using_aztec_address,
        messages::encryption::log_encryption::{LogEncryption, PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS},
        test::helpers::test_environment::TestEnvironment,
    };
    use super::AES128;
    use protocol_types::{
        address::AztecAddress,
        indexed_tagging_secret::IndexedTaggingSecret,
        traits::{Deserialize, FromField},
    };
    use std::{embedded_curve_ops::EmbeddedCurveScalar, test::OracleMock};

    #[test]
    unconstrained fn encrypt_decrypt_log() {
        let mut env = TestEnvironment::new();
        // Advance 1 block so we can read historic state from private
        env.advance_block_by(1);

        let plaintext = [1, 2, 3];

        let recipient = AztecAddress::from_field(
            0x25afb798ea6d0b8c1618e50fdeafa463059415013d3b7c75d46abf5e242be70c,
        );

        // Mock random values for deterministic test
        let eph_sk = 0x1358d15019d4639393d62b97e1588c095957ce74a1c32d6ec7d62fe6705d9538;
        let _ = OracleMock::mock("getRandomField").returns(eph_sk).times(1);

        let randomness = 0x0101010101010101010101010101010101010101010101010101010101010101;
        let _ = OracleMock::mock("getRandomField").returns(randomness).times(1000000);

        let _ = OracleMock::mock("getIndexedTaggingSecretAsSender").returns(
            IndexedTaggingSecret::deserialize([69420, 1337]),
        );
        let _ = OracleMock::mock("incrementAppTaggingSecretIndexAsSender").returns(());

        // Encrypt the log
        let encrypted_log = BoundedVec::from_array(AES128::encrypt_log(plaintext, recipient));

        // Mock shared secret for deterministic test
        let shared_secret = derive_ecdh_shared_secret_using_aztec_address(
            EmbeddedCurveScalar::from_field(eph_sk),
            recipient,
        );
        let _ = OracleMock::mock("getSharedSecret").returns(shared_secret);

        // Decrypt the log
        let decrypted = AES128::decrypt_log(encrypted_log, recipient);

        // The decryption function spits out a BoundedVec because it's designed to work with logs with unknown length
        // at compile time. For this reason we need to convert the original input to a BoundedVec.
        let plaintext_bvec =
            BoundedVec::<Field, PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS>::from_array(plaintext);

        // Verify decryption matches original plaintext
        assert_eq(decrypted, plaintext_bvec, "Decrypted bytes should match original plaintext");

        // The following is a workaround of "struct is never constructed" Noir compilation error (we only ever use
        // static methods of the struct).
        let _ = AES128 {};
    }
}
