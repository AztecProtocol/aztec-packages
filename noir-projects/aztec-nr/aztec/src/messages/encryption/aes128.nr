use crate::protocol::{
    address::AztecAddress,
    constants::{DOM_SEP__CIPHERTEXT_FIELD_MASK, DOM_SEP__SYMMETRIC_KEY, DOM_SEP__SYMMETRIC_KEY_2},
    hash::poseidon2_hash_with_separator,
    point::Point,
    public_keys::AddressPoint,
};

use crate::{
    keys::{ecdh_shared_secret::derive_ecdh_shared_secret, ephemeral::generate_positive_ephemeral_key_pair},
    messages::{
        encoding::{
            EPH_PK_X_SIZE_IN_FIELDS, HEADER_CIPHERTEXT_SIZE_IN_BYTES, MESSAGE_CIPHERTEXT_LEN, MESSAGE_PLAINTEXT_LEN,
            MESSAGE_PLAINTEXT_SIZE_IN_BYTES,
        },
        encryption::message_encryption::MessageEncryption,
        logs::arithmetic_generics_utils::{
            get_arr_of_size__message_bytes__from_PT, get_arr_of_size__message_bytes_padding__from_PT,
        },
    },
    oracle::{aes128_decrypt::aes128_decrypt_oracle, random::random, shared_secret::get_shared_secret},
    utils::{
        array,
        conversion::{
            bytes_to_fields::{bytes_from_fields, bytes_to_fields},
            fields_to_bytes::{fields_from_bytes, fields_to_bytes},
        },
        point::point_from_x_coord_and_sign,
    },
};

use std::aes128::aes128_encrypt;

/// Computes N close-to-uniformly-random 256 bits from a given ECDH shared_secret.
///
/// NEVER re-use the same iv and sym_key. DO NOT call this function more than once with the same shared_secret.
///
/// This function is only known to be safe if shared_secret is computed by combining a random ephemeral key with an
/// address point. See big comment within the body of the function. See big comment within the body of the function.
fn extract_many_close_to_uniformly_random_256_bits_from_ecdh_shared_secret_using_poseidon2_unsafe<let N: u32>(
    shared_secret: Point,
) -> [[u8; 32]; N] {
    /*
     * Unsafe because of https://eprint.iacr.org/2010/264.pdf Page 13, Lemma 2 (and the * two
    paragraphs below it).
    *
    * If you call this function, you need to be careful and aware of how the arg
    * `shared_secret` has been derived.
    *
    * The paper says that the way you derive aes keys and IVs should be fine with poseidon2
    * (modelled as a RO), as long as you _don't_ use Poseidon2 as a PRG to generate the * two
    exponents x & y which multiply to the shared secret S:
    *
    * S = [x*y]*G.
    *
    * (Otherwise, you would have to "key" poseidon2, i.e. generate a uniformly string K
    * which can be public and compute Hash(x) as poseidon(K,x)).
    * In that lemma, k would be 2*254=508, and m would be the number of points on the * grumpkin
    curve (which is close to r according to the Hasse bound).
    *
    * Our shared secret S is [esk * address_sk] * G, and the question is: * Can we compute hash(S)
    using poseidon2 instead of sha256?
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

    let mut all_bytes: [[u8; 32]; N] = std::mem::zeroed();
    // We restrict N to be < 2^8, because of how we compute the domain separator from k below (where k <= N must be 8
    // bits). In practice, it's extremely unlikely that an app will want to compute >= 256 ciphertexts.
    std::static_assert(N < 256, "N too large");
    for k in 0..N {
        // We augment the domain separator with the loop index, so that we can generate N lots of randomness.
        let k_shift = (k << 8);
        let separator_1 = k_shift + DOM_SEP__SYMMETRIC_KEY;
        let separator_2 = k_shift + DOM_SEP__SYMMETRIC_KEY_2;

        let rand1: Field = poseidon2_hash_with_separator([shared_secret.x, shared_secret.y], separator_1);
        let rand2: Field = poseidon2_hash_with_separator([shared_secret.x, shared_secret.y], separator_2);

        let rand1_bytes: [u8; 32] = rand1.to_be_bytes();
        let rand2_bytes: [u8; 32] = rand2.to_be_bytes();

        let mut bytes: [u8; 32] = [0; 32];
        for i in 0..16 {
            // We take bytes from the "little end" of the be-bytes arrays:
            let j = 32 - i - 1;
            bytes[i] = rand1_bytes[j];
            bytes[16 + i] = rand2_bytes[j];
        }

        all_bytes[k] = bytes;
    }

    all_bytes
}

fn derive_aes_symmetric_key_and_iv_from_uniformly_random_256_bits<let N: u32>(
    many_random_256_bits: [[u8; 32]; N],
) -> [([u8; 16], [u8; 16]); N] {
    // Many (sym_key, iv) pairs:
    let mut many_pairs: [([u8; 16], [u8; 16]); N] = std::mem::zeroed();
    for k in 0..N {
        let random_256_bits = many_random_256_bits[k];
        let mut sym_key = [0; 16];
        let mut iv = [0; 16];
        for i in 0..16 {
            sym_key[i] = random_256_bits[i];
            iv[i] = random_256_bits[i + 16];
        }
        many_pairs[k] = (sym_key, iv);
    }

    many_pairs
}

pub fn derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_poseidon2_unsafe<let N: u32>(
    shared_secret: Point,
) -> [([u8; 16], [u8; 16]); N] {
    let many_random_256_bits: [[u8; 32]; N] =
        extract_many_close_to_uniformly_random_256_bits_from_ecdh_shared_secret_using_poseidon2_unsafe(shared_secret);

    derive_aes_symmetric_key_and_iv_from_uniformly_random_256_bits(many_random_256_bits)
}

pub struct AES128 {}

impl MessageEncryption for AES128 {

    /// AES128-CBC encryption for Aztec protocol messages.
    ///
    /// ## Overview
    ///
    /// The plaintext is an array of up to `MESSAGE_PLAINTEXT_LEN` (12) fields. The output is always exactly
    /// `MESSAGE_CIPHERTEXT_LEN` (15) fields, regardless of plaintext size. All output fields except the
    /// ephemeral public key are uniformly random `Field` values to any observer without knowledge of the
    /// shared secret, making all encrypted messages indistinguishable by size or content.
    ///
    /// ## PKCS#7 Padding
    ///
    /// AES operates on 16-byte blocks, so the plaintext must be padded to a multiple of 16. PKCS#7 padding always
    /// adds at least 1 byte (so the receiver can always detect and strip it), which means:
    /// - 1 B plaintext  -> 15 B padding -> 16 B total
    /// - 15 B plaintext ->  1 B padding -> 16 B total
    /// - 16 B plaintext -> 16 B padding -> 32 B total (full extra block)
    ///
    /// In general: if the plaintext is already a multiple of 16, a full 16-byte padding block is appended.
    ///
    /// ## Encryption Steps
    ///
    /// **1. Body encryption.** The plaintext fields are serialized to bytes (32 bytes per field) and AES-128-CBC
    /// encrypted. Since 32 is a multiple of 16, PKCS#7 always adds a full 16-byte padding block (see above):
    ///
    /// ```text
    /// +---------------------------------------------+
    /// |                   body ct                    |
    /// |            PlaintextLen*32 + 16 B            |
    /// +-------------------------------+--------------+
    /// | encrypted plaintext fields    | PKCS#7 (16B) |
    /// | (serialized at 32 B each)     |              |
    /// +-------------------------------+--------------+
    /// ```
    ///
    /// **2. Header encryption.** The byte length of `body_ct` is stored as a 2-byte big-endian integer. This 2-byte
    /// header plaintext is then AES-encrypted; PKCS#7 pads the remaining 14 bytes to fill one 16-byte AES block,
    /// producing a 16-byte header ciphertext:
    ///
    /// ```text
    /// +---------------------------+
    /// |         header ct         |
    /// |            16 B           |
    /// +--------+------------------+
    /// | body ct| PKCS#7 (14B)     |
    /// | length |                  |
    /// | (2 B)  |                  |
    /// +--------+------------------+
    /// ```
    ///
    /// ## Wire Format
    ///
    /// Messages are transmitted as fields, not bytes. A field is ~254 bits and can safely store 31 whole bytes, so
    /// we need to pack our byte data into 31-byte chunks. This packing drives the wire format.
    ///
    /// **Step 1 -- Assemble bytes.** The ciphertexts are laid out in a byte array, padded with zero bytes to a
    /// multiple of 31 so it divides evenly into fields:
    ///
    /// ```text
    /// +------------+-------------------------+---------+
    /// | header ct  |        body ct          | byte pad|
    /// |   16 B     | PlaintextLen*32 + 16 B  | (zeros) |
    /// +------------+-------------------------+---------+
    /// |<-------- padded to a multiple of 31 B -------->|
    /// ```
    ///
    /// **Step 2 -- Pack and mask.** The byte array is split into 31-byte chunks, each stored in one field. A
    /// Poseidon2-derived mask (see `derive_field_mask`) is added to each so that the resulting fields appear as
    /// uniformly random `Field` values to any observer without knowledge of the shared secret, hiding the fact
    /// that the underlying ciphertext consists of 128-bit AES blocks.
    ///
    /// **Step 3 -- Assemble ciphertext.** The ephemeral public key x-coordinate is prepended and random field padding
    /// is appended to fill to 15 fields:
    ///
    /// ```text
    /// +----------+-------------------------+-------------------+
    /// | eph_pk.x |  masked message fields   | random field pad  |
    /// |          | (packed 31 B per field)  |  (fills to 15)    |
    /// +----------+-------------------------+-------------------+
    /// |<---------- MESSAGE_CIPHERTEXT_LEN = 15 fields -------->|
    /// ```
    ///
    /// ## Key Derivation
    ///
    /// Two (key, IV) pairs are derived from the ECDH shared secret via Poseidon2 hashing with different domain
    /// separators: one pair for the body ciphertext and one for the header ciphertext.
    fn encrypt<let PlaintextLen: u32>(
        plaintext: [Field; PlaintextLen],
        recipient: AztecAddress,
    ) -> [Field; MESSAGE_CIPHERTEXT_LEN] {
        std::static_assert(
            PlaintextLen <= MESSAGE_PLAINTEXT_LEN,
            "Plaintext length exceeds MESSAGE_PLAINTEXT_LEN",
        );

        // AES 128 operates on bytes, not fields, so we need to convert the fields to bytes. (This process is then
        // reversed when processing the message in `process_message_ciphertext`)
        let plaintext_bytes = fields_to_bytes(plaintext);

        // Derive ECDH shared secret with recipient using a fresh ephemeral keypair.
        let (eph_sk, eph_pk) = generate_positive_ephemeral_key_pair();

        let ciphertext_shared_secret = derive_ecdh_shared_secret(
            eph_sk,
            recipient
                .to_address_point()
                .unwrap_or(
                    // Safety: if the recipient is an invalid address, then it is not possible to encrypt a message for
                    // them because we cannot establish a shared secret. This is never expected to occur during normal
                    // operation. However, it is technically possible for us to receive an invalid address, and we must
                    // therefore handle it. We could simply fail, but that'd introduce a potential security issue in
                    // which an attacker forces a contract to encrypt a message for an invalid address, resulting in an
                    // impossible transaction - this is sometimes called a 'king of the hill' attack. We choose instead
                    // to not fail and encrypt the plaintext regardless using the shared secret that results from a
                    // random valid address. The sender is free to choose this address and hence shared secret, but
                    // this has no security implications as they already know not only the full plaintext but also the
                    // ephemeral private key anyway.
                    unsafe { random_address_point() },
                )
                .inner,
        );

        // AES128-CBC encrypt the plaintext bytes.
        // It is safe to call the `unsafe` function here, because we know the `shared_secret` was derived using an
        // AztecAddress (the recipient). See the block comment at the start of this unsafe target function for more
        // info.
        let pairs = derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_poseidon2_unsafe::<2>(
            ciphertext_shared_secret,
        );
        let (body_sym_key, body_iv) = pairs[0];
        let (header_sym_key, header_iv) = pairs[1];

        let ciphertext_bytes = aes128_encrypt(plaintext_bytes, body_iv, body_sym_key);

        // Each plaintext field is 32 bytes (a multiple of the 16-byte AES block
        // size), so PKCS#7 always appends a full 16-byte padding block:
        //   |ciphertext| = PlaintextLen*32 + 16 = 16 * (1 + PlaintextLen*32 / 16)
        std::static_assert(
            ciphertext_bytes.len() == 16 * (1 + (PlaintextLen * 32) / 16),
            "unexpected ciphertext length",
        );

        // Encrypt a 2-byte header containing the body ciphertext length.
        let mut header_plaintext: [u8; 2] = [0 as u8; 2];
        let ciphertext_bytes_length = ciphertext_bytes.len();
        header_plaintext[0] = (ciphertext_bytes_length >> 8) as u8;
        header_plaintext[1] = ciphertext_bytes_length as u8;

        // Note: the aes128_encrypt builtin fn automatically appends bytes to the input, according to pkcs#7; hence why
        // the output `header_ciphertext_bytes` is 16 bytes larger than the input in this case.
        let header_ciphertext_bytes = aes128_encrypt(header_plaintext, header_iv, header_sym_key);
        // Verify expected header ciphertext size at compile time.
        std::static_assert(
            header_ciphertext_bytes.len() == HEADER_CIPHERTEXT_SIZE_IN_BYTES,
            "unexpected ciphertext header length",
        );

        // Assemble the message byte array:
        //  [header_ct (16B)] [body_ct] [padding to mult of 31]
        let message_bytes_padding_to_mult_31 = get_arr_of_size__message_bytes_padding__from_PT::<PlaintextLen * 32>();

        let mut message_bytes = get_arr_of_size__message_bytes__from_PT::<PlaintextLen * 32>();

        std::static_assert(
            message_bytes.len() % 31 == 0,
            "Unexpected error: message_bytes.len() should be divisible by 31, by construction.",
        );

        let mut offset = 0;
        for i in 0..header_ciphertext_bytes.len() {
            message_bytes[offset + i] = header_ciphertext_bytes[i];
        }
        offset += header_ciphertext_bytes.len();

        for i in 0..ciphertext_bytes.len() {
            message_bytes[offset + i] = ciphertext_bytes[i];
        }
        offset += ciphertext_bytes.len();

        for i in 0..message_bytes_padding_to_mult_31.len() {
            message_bytes[offset + i] = message_bytes_padding_to_mult_31[i];
        }
        offset += message_bytes_padding_to_mult_31.len();

        // Ideally we would be able to have a static assert where we check that the offset would be such that we've
        // written to the entire log_bytes array, but we cannot since Noir does not treat the offset as a comptime
        // value (despite the values that it goes through being known at each stage). We instead check that the
        // computation used to obtain the offset computes the expected value (which we _can_ do in a static check), and
        // then add a cheap runtime check to also validate that the offset matches this.
        std::static_assert(
            header_ciphertext_bytes.len() + ciphertext_bytes.len() + message_bytes_padding_to_mult_31.len()
                == message_bytes.len(),
            "unexpected message length",
        );
        assert(offset == message_bytes.len(), "unexpected encrypted message length");

        // Pack message bytes into fields (31 bytes per field) and prepend eph_pk.x.
        let message_bytes_as_fields = bytes_to_fields(message_bytes);

        let mut ciphertext: [Field; MESSAGE_CIPHERTEXT_LEN] = [0; MESSAGE_CIPHERTEXT_LEN];

        ciphertext[0] = eph_pk.x;

        // Mask each content field with a Poseidon2-derived value, so that they appear as uniformly random `Field`
        // values
        let mut offset = 1;
        for i in 0..message_bytes_as_fields.len() {
            let mask = derive_field_mask(ciphertext_shared_secret, i as u32);
            ciphertext[offset + i] = message_bytes_as_fields[i] + mask;
        }
        offset += message_bytes_as_fields.len();

        // Pad with random fields so that padding is indistinguishable from masked data fields.
        for i in offset..MESSAGE_CIPHERTEXT_LEN {
            // Safety: we assume that the sender wants for the message to be private - a malicious one could simply
            // reveal its contents publicly. It is therefore fine to trust the sender to provide random padding.
            ciphertext[i] = unsafe { random() };
        }

        ciphertext
    }

    unconstrained fn decrypt(
        ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
        recipient: AztecAddress,
    ) -> Option<BoundedVec<Field, MESSAGE_PLAINTEXT_LEN>> {
        let eph_pk_x = ciphertext.get(0);

        let masked_fields = array::subbvec::<Field, MESSAGE_CIPHERTEXT_LEN, MESSAGE_CIPHERTEXT_LEN - EPH_PK_X_SIZE_IN_FIELDS>(
            ciphertext,
            EPH_PK_X_SIZE_IN_FIELDS,
        );

        // With the x-coordinate of the ephemeral public key we can reconstruct the point as we know that the
        // y-coordinate must be positive. This may fail however, as not all x-coordinates are on the curve. In that
        // case, we simply return `Option::none`.
        point_from_x_coord_and_sign(eph_pk_x, true).map(|eph_pk| {
            // Derive shared secret
            let ciphertext_shared_secret = get_shared_secret(recipient, eph_pk);

            let unmasked_fields = masked_fields.mapi(|i, field| {
                let unmasked = unmask_field(ciphertext_shared_secret, i, field);
                // If we failed to unmask the field, we are dealing with the random padding. We'll ignore it later,
                // so we can simply set it to 0
                unmasked.unwrap_or(0)
            });
            let ciphertext_without_eph_pk_x = bytes_from_fields(unmasked_fields);

            // Derive symmetric keys:
            let pairs = derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_poseidon2_unsafe::<2>(
                ciphertext_shared_secret,
            );
            let (body_sym_key, body_iv) = pairs[0];
            let (header_sym_key, header_iv) = pairs[1];

            // Extract the header ciphertext
            let header_start = 0;
            let header_ciphertext: [u8; HEADER_CIPHERTEXT_SIZE_IN_BYTES] =
                array::subarray(ciphertext_without_eph_pk_x.storage(), header_start);
            // We need to convert the array to a BoundedVec because the oracle expects a BoundedVec as it's designed to
            // work with messages with unknown length at compile time. This would not be necessary here as the header
            // ciphertext length is fixed. But we do it anyway to not have to have duplicate oracles.
            let header_ciphertext_bvec =
                BoundedVec::<u8, HEADER_CIPHERTEXT_SIZE_IN_BYTES>::from_array(header_ciphertext);

            // Decrypt header
            let header_plaintext = aes128_decrypt_oracle(header_ciphertext_bvec, header_iv, header_sym_key);

            // Extract ciphertext length from header (2 bytes, big-endian)
            let ciphertext_length = ((header_plaintext.get(0) as u32) << 8) | (header_plaintext.get(1) as u32);

            // Extract and decrypt main ciphertext
            let ciphertext_start = header_start + HEADER_CIPHERTEXT_SIZE_IN_BYTES;
            let ciphertext_with_padding: [u8; MESSAGE_PLAINTEXT_SIZE_IN_BYTES] =
                array::subarray(ciphertext_without_eph_pk_x.storage(), ciphertext_start);
            let ciphertext: BoundedVec<u8, MESSAGE_PLAINTEXT_SIZE_IN_BYTES> =
                BoundedVec::from_parts(ciphertext_with_padding, ciphertext_length);

            // Decrypt main ciphertext and return it
            let plaintext_bytes = aes128_decrypt_oracle(ciphertext, body_iv, body_sym_key);

            // Each field of the original message was serialized to 32 bytes so we convert
            // the bytes back to fields.
            fields_from_bytes(plaintext_bytes)
        })
    }
}

/// 2^248: upper bound for values that fit in 31 bytes
global TWO_POW_248: Field = 2.pow_32(248);

/// Removes the Poseidon2-derived mask from a ciphertext field. Returns the unmasked value if it fits in 31 bytes
/// (a content field), or `None` if it doesn't (random padding). Unconstrained to prevent accidental use in
/// constrained context.
unconstrained fn unmask_field(shared_secret: Point, index: u32, masked: Field) -> Option<Field> {
    let unmasked = masked - derive_field_mask(shared_secret, index);
    if unmasked.lt(TWO_POW_248) {
        Option::some(unmasked)
    } else {
        Option::none()
    }
}

/// Derives a field mask from an ECDH shared secret and field index. Applied only to data fields (those carrying
/// packed message bytes). Padding fields use `random()` instead.
fn derive_field_mask(shared_secret: Point, index: u32) -> Field {
    poseidon2_hash_with_separator(
        [shared_secret.x, shared_secret.y],
        DOM_SEP__CIPHERTEXT_FIELD_MASK + index,
    )
}

/// Produces a random valid address point, i.e. one that is on the curve. This is equivalent to calling
/// [`AztecAddress::to_address_point`] on a random valid address.
unconstrained fn random_address_point() -> AddressPoint {
    let mut result = std::mem::zeroed();

    loop {
        // We simply produce random x coordinates until we find one that is on the curve. About half of the x
        // coordinates fulfill this condition, so this should only take a few iterations at most.
        let x_coord = random();
        let point = point_from_x_coord_and_sign(x_coord, true);
        if point.is_some() {
            result = AddressPoint { inner: point.unwrap() };
            break;
        }
    }

    result
}

mod test {
    use crate::{
        keys::ecdh_shared_secret::derive_ecdh_shared_secret,
        messages::{encoding::MESSAGE_PLAINTEXT_LEN, encryption::message_encryption::MessageEncryption},
        test::helpers::test_environment::TestEnvironment,
    };
    use crate::protocol::{address::AztecAddress, traits::FromField};
    use super::{AES128, random_address_point};
    use std::{embedded_curve_ops::EmbeddedCurveScalar, test::OracleMock};

    #[test]
    unconstrained fn encrypt_decrypt_deterministic() {
        let env = TestEnvironment::new();

        // Message decryption requires oracles that are only available during private execution
        env.private_context(|_| {
            let plaintext = [1, 2, 3];

            let recipient = AztecAddress::from_field(
                0x25afb798ea6d0b8c1618e50fdeafa463059415013d3b7c75d46abf5e242be70c,
            );

            // Mock random values for deterministic test
            let eph_sk = 0x1358d15019d4639393d62b97e1588c095957ce74a1c32d6ec7d62fe6705d9538;
            let _ = OracleMock::mock("utilityGetRandomField").returns(eph_sk).times(1);

            let randomness = 0x0101010101010101010101010101010101010101010101010101010101010101;
            let _ = OracleMock::mock("utilityGetRandomField").returns(randomness).times(1000000);

            let _ = OracleMock::mock("privateGetNextAppTagAsSender").returns(42);

            // Encrypt the message
            let encrypted_message = BoundedVec::from_array(AES128::encrypt(plaintext, recipient));

            // Mock shared secret for deterministic test
            let shared_secret = derive_ecdh_shared_secret(
                EmbeddedCurveScalar::from_field(eph_sk),
                recipient.to_address_point().unwrap().inner,
            );

            let _ = OracleMock::mock("utilityGetSharedSecret").returns(shared_secret);

            // Decrypt the message
            let decrypted = AES128::decrypt(encrypted_message, recipient).unwrap();

            // The decryption function spits out a BoundedVec because it's designed to work with messages with unknown
            // length at compile time. For this reason we need to convert the original input to a BoundedVec.
            let plaintext_bvec = BoundedVec::<Field, MESSAGE_PLAINTEXT_LEN>::from_array(plaintext);

            // Verify decryption matches original plaintext
            assert_eq(decrypted, plaintext_bvec, "Decrypted bytes should match original plaintext");

            // The following is a workaround of "struct is never constructed" Noir compilation error (we only ever use
            // static methods of the struct).
            let _ = AES128 {};
        });
    }

    #[test]
    unconstrained fn encrypt_decrypt_random() {
        // Same as `encrypt_decrypt_deterministic`, except we don't mock any of the oracles and rely on
        // `TestEnvironment` instead.
        let mut env = TestEnvironment::new();

        let recipient = env.create_light_account();

        env.private_context(|_| {
            let plaintext = [1, 2, 3];
            let ciphertext = AES128::encrypt(plaintext, recipient);

            assert_eq(
                AES128::decrypt(BoundedVec::from_array(ciphertext), recipient).unwrap(),
                BoundedVec::from_array(plaintext),
            );
        });
    }

    #[test]
    unconstrained fn encrypt_to_invalid_address() {
        // x = 3 is a non-residue for this curve, resulting in an invalid address
        let invalid_address = AztecAddress { inner: 3 };

        // We just test that we produced some output and did not crash - the result is gibberish as it is encrypted
        // using a public key for which we do not know the private key.
        let _ = AES128::encrypt([1, 2, 3, 4], invalid_address);
    }

    // Documents the PKCS#7 padding behavior that `encrypt` relies on (see its static_assert).
    #[test]
    fn pkcs7_padding_always_adds_at_least_one_byte() {
        let key = [0 as u8; 16];
        let iv = [0 as u8; 16];

        // 1 byte input + 15 bytes padding = 16 bytes
        assert_eq(std::aes128::aes128_encrypt([0; 1], iv, key).len(), 16);

        // 15 bytes input + 1 byte padding = 16 bytes
        assert_eq(std::aes128::aes128_encrypt([0; 15], iv, key).len(), 16);

        // 16 bytes input (block-aligned) + full 16-byte padding block = 32 bytes
        assert_eq(std::aes128::aes128_encrypt([0; 16], iv, key).len(), 32);
    }

    #[test]
    unconstrained fn encrypt_decrypt_max_size_plaintext() {
        let mut env = TestEnvironment::new();
        let recipient = env.create_light_account();

        env.private_context(|_| {
            let mut plaintext = [0; MESSAGE_PLAINTEXT_LEN];
            for i in 0..MESSAGE_PLAINTEXT_LEN {
                plaintext[i] = i as Field;
            }
            let ciphertext = AES128::encrypt(plaintext, recipient);

            assert_eq(
                AES128::decrypt(BoundedVec::from_array(ciphertext), recipient).unwrap(),
                BoundedVec::from_array(plaintext),
            );
        });
    }

    #[test(should_fail_with = "Plaintext length exceeds MESSAGE_PLAINTEXT_LEN")]
    unconstrained fn encrypt_oversized_plaintext() {
        let address = AztecAddress { inner: 3 };
        let plaintext: [Field; MESSAGE_PLAINTEXT_LEN + 1] = [0; MESSAGE_PLAINTEXT_LEN + 1];
        let _ = AES128::encrypt(plaintext, address);
    }

    #[test]
    unconstrained fn random_address_point_produces_valid_points() {
        // About half of random addresses are invalid, so testing just a couple gives us high confidence that
        // `random_address_point` is indeed producing valid addresses.
        for _ in 0..10 {
            let random_address = AztecAddress { inner: random_address_point().inner.x };
            assert(random_address.to_address_point().is_some());
        }
    }

    #[test]
    unconstrained fn decrypt_invalid_ephemeral_public_key() {
        let mut env = TestEnvironment::new();

        let recipient = env.create_light_account();

        env.private_context(|_| {
            let plaintext = [1, 2, 3, 4];
            let ciphertext = AES128::encrypt(plaintext, recipient);

            // The first field of the ciphertext is the x-coordinate of the ephemeral public key. We set it to a known
            // non-residue (3), causing `decrypt` to fail to produce a decryption shared secret.
            let mut bad_ciphertext = BoundedVec::from_array(ciphertext);
            bad_ciphertext.set(0, 3);

            assert(AES128::decrypt(bad_ciphertext, recipient).is_none());
        });
    }
}
