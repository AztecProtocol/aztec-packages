/// Decrypts a ciphertext, using AES128.
///
/// Returns a padded plaintext, of the same size as the input ciphertext.
/// Note that between 1-16 bytes at the end of the returned plaintext will be pkcs#7 padding.
///
/// A reminder on pkcs#7 padding:
/// PKCS#7 padding standard says to pad a plaintext to the next multiple of 16 bytes
/// with repeated bytes of the length of the padding.
///
///     If the plaintext is 0 bytes:  Pad with 0x10 (16) sixteen times.
///     If the plaintext is 1 byte:   Pad with 0x0f (15) fifteen times.
///     If the plaintext is 2 bytes:  Pad with 0x0e (14) fourteen times.
///     ...
///     If the plaintext is 15 bytes: Pad with 0x01 one time.
///
/// So the final byte always tells you how long the padding is.
///
/// It's up to the calling function to identify and remove that padding.
/// See the tests below for an example of how.
///
/// It's up to the calling function to determine whether decryption succeeded or failed.
/// See the tests below for an example of how.
#[oracle(aes128Decrypt)]
pub unconstrained fn aes128_decrypt_oracle<let N: u32>(
    ciphertext: [u8; N],
    iv: [u8; 16],
    sym_key: [u8; 16],
) -> BoundedVec<u8, N> {}

mod test {
    use crate::{
        encrypted_logs::encrypt::aes128::derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_sha256,
        utils::{array::{subarray::subarray, subbvec::subbvec}, point::point_from_x_coord},
    };
    use super::aes128_decrypt_oracle;
    use std::aes128::aes128_encrypt;

    global TEST_PLAINTEXT_LENGTH: u32 = 10;
    global TEST_CIPHERTEXT_LENGTH: u32 = 16;
    global TEST_PADDING_LENGTH: u32 = TEST_CIPHERTEXT_LENGTH - TEST_PLAINTEXT_LENGTH;

    #[test]
    unconstrained fn aes_encrypt_then_decrypt() {
        let ciphertext_shared_secret = point_from_x_coord(1);

        let (sym_key, iv) = derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_sha256(
            ciphertext_shared_secret,
        );

        let plaintext: [u8; TEST_PLAINTEXT_LENGTH] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

        let ciphertext: [u8; TEST_CIPHERTEXT_LENGTH] = aes128_encrypt(plaintext, iv, sym_key);

        let received_plaintext = aes128_decrypt_oracle(ciphertext, iv, sym_key);

        assert_eq(received_plaintext.len(), TEST_PLAINTEXT_LENGTH);
        assert_eq(received_plaintext.max_len(), TEST_CIPHERTEXT_LENGTH);
        assert_eq(
            subarray::<_, _, TEST_PLAINTEXT_LENGTH>(received_plaintext.storage(), 0),
            plaintext,
        );
        assert_eq(
            subarray::<_, _, TEST_PADDING_LENGTH>(
                received_plaintext.storage(),
                TEST_PLAINTEXT_LENGTH,
            ),
            [0 as u8; TEST_PADDING_LENGTH],
        );
    }

    global TEST_MAC_LENGTH: u32 = 32;

    #[test(should_fail_with = "mac does not match")]
    unconstrained fn aes_encrypt_then_decrypt_with_bad_sym_key_is_caught() {
        // The AES decryption oracle will not fail for any ciphertext; it will always
        // return some data. As for whether the decryption was successful, it's up
        // to the app to check this in a custom way.
        //
        // E.g. if it's a note that's been encrypted, then upon decryption, the app
        // can check to see if the note hash exists onchain. If it doesn't exist
        // onchain, then that's a strong indicator that decryption has failed.
        //
        // E.g. for non-note messages, the plaintext could include a MAC
        // (https://en.wikipedia.org/wiki/Message_authentication_code). We
        // demonstrate what this could look like in this test.
        //
        // We compute a MAC and we include that MAC in the plaintext. We then encrypt
        // this plaintext to get a ciphertext. We broadcast the [ciphertext, mac]
        // tuple. The eventual decryptor will expect the mac in the decrypted plaintext
        // to match the mac that was broadcast. If not, the recipient knows that
        // decryption has failed.
        let ciphertext_shared_secret = point_from_x_coord(1);

        let (sym_key, iv) = derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_sha256(
            ciphertext_shared_secret,
        );

        let mac_preimage = 0x42;
        let mac = std::hash::poseidon2::Poseidon2::hash([mac_preimage], 1);
        let mac_as_bytes = mac.to_be_bytes::<TEST_MAC_LENGTH>();

        let plaintext: [u8; TEST_PLAINTEXT_LENGTH] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

        // We append the mac to the plaintext. It doesn't necessarily have to be 32 bytes;
        // that's quite an extreme length. 16 bytes or 8 bytes might be sufficient, and would
        // save on data broadcasting costs. The shorter the mac, the more possibility
        // of false positive decryptions (decryption seemingly succeeding, but the
        // decrypted plaintext being garbage).
        // Some projects use the `iv` (all 16 bytes or the first 8 bytes) as a mac.
        let mut plaintext_with_mac = [0 as u8; TEST_PLAINTEXT_LENGTH + TEST_MAC_LENGTH];
        for i in 0..TEST_PLAINTEXT_LENGTH {
            plaintext_with_mac[i] = plaintext[i];
        }
        for i in 0..TEST_MAC_LENGTH {
            plaintext_with_mac[TEST_PLAINTEXT_LENGTH + i] = mac_as_bytes[i];
        }

        let ciphertext = aes128_encrypt(plaintext_with_mac, iv, sym_key);

        // We now would broadcast the tuple [ciphertext, mac] to the network.
        // The recipient will then decrypt the ciphertext, and if the mac inside the
        // received plaintext matches the mac that was broadcast, then the recipient
        // knows that decryption was successful.

        // For this test, we intentionally mutate the sym_key to a bad one, so that
        // decryption fails. This allows us to explore how the recipient can detect
        // failed decryption by checking the decrypted mac against the broadcasted
        // mac.
        let mut bad_sym_key = sym_key;
        bad_sym_key[0] = 0;

        let received_plaintext = aes128_decrypt_oracle(ciphertext, iv, bad_sym_key);

        let extracted_mac_as_bytes: [u8; TEST_MAC_LENGTH] =
            subarray(received_plaintext.storage(), TEST_PLAINTEXT_LENGTH);

        // We expect this assertion to fail, because we used a bad sym key.
        assert_eq(mac_as_bytes, extracted_mac_as_bytes, "mac does not match");
    }
}
