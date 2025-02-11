/// Decrypts a ciphertext, using AES128.
///
/// Returns a padded plaintext, of the same size as the input ciphertext.
/// Note that between 1-16 bytes at the end of the returned plaintext will be pkcs#7 padding.
/// It's up to the calling function to identify and remove that padding.
/// See the tests below for an example of how.
/// It's up to the calling function to determine whether decryption succeeded or failed.
/// See the tests below for an example of how.
unconstrained fn aes128_decrypt_oracle_wrapper<let N: u32>(
    ciphertext: [u8; N],
    iv: [u8; 16],
    sym_key: [u8; 16],
) -> [u8; N] {
    aes128_decrypt_oracle(ciphertext, iv, sym_key)
}

#[oracle(aes128Decrypt)]
unconstrained fn aes128_decrypt_oracle<let N: u32>(
    ciphertext: [u8; N],
    iv: [u8; 16],
    sym_key: [u8; 16],
) -> [u8; N] {}

mod test {
    use crate::{
        encrypted_logs::encrypt::aes128::derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_sha256,
        utils::point::point_from_x_coord,
    };
    use super::aes128_decrypt_oracle_wrapper;
    use std::aes128::aes128_encrypt;

    #[test]
    unconstrained fn aes_encrypt_then_decrypt() {
        let ciphertext_shared_secret = point_from_x_coord(1);

        let (sym_key, iv) = derive_aes_symmetric_key_and_iv_from_ecdh_shared_secret_using_sha256(
            ciphertext_shared_secret,
        );

        let plaintext: [u8; 10] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

        let ciphertext = aes128_encrypt(plaintext, iv, sym_key);

        let received_plaintext = aes128_decrypt_oracle_wrapper(ciphertext, iv, sym_key);
        let padding_length = received_plaintext[received_plaintext.len() - 1] as u32;

        // A BoundedVec could also be used.
        let mut received_plaintext_with_padding_removed = std::collections::vec::Vec::new();
        for i in 0..received_plaintext.len() - padding_length {
            received_plaintext_with_padding_removed.push(received_plaintext[i]);
        }

        assert_eq(received_plaintext_with_padding_removed.slice, plaintext.as_slice());
    }

    #[test(should_fail_with = "mac does not match")]
    unconstrained fn aes_encrypt_then_decrypt_with_bad_sym_key_is_caught() {
        // The AES decryption oracle will not fail for any ciphertext; it will always
        // return some data. As for whether the decryption was successful, it's up
        // to the app to check this in a custom way.
        // E.g. if it's a note that's been encrypted, then upon decryption, the app
        // can check to see if the note hash exists onchain. If it doesn't exist
        // onchain, then that's a strong indicator that decryption has failed.
        // E.g. for non-note messages, the plaintext could include a MAC. We
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
        let mac_as_bytes = mac.to_be_bytes::<32>();

        let plaintext: [u8; 10] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

        // We append the mac to the plaintext. It doesn't necessarily have to be 32 bytes;
        // that's quite an extreme length. 16 bytes or 8 bytes might be sufficient, and would
        // save on data broadcasting costs.
        let mut plaintext_with_mac = [0 as u8; 10 + 32];
        for i in 0..10 {
            plaintext_with_mac[i] = plaintext[i];
        }
        let offset = 10;
        for i in 0..32 {
            plaintext_with_mac[offset + i] = mac_as_bytes[i];
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

        let received_plaintext = aes128_decrypt_oracle_wrapper(ciphertext, iv, bad_sym_key);

        let mut extracted_mac_as_bytes = [0 as u8; 32];
        for i in 0..32 {
            extracted_mac_as_bytes[i] = received_plaintext[offset + i];
        }

        // We expect this assertion to fail, because we used a bad sym key.
        assert_eq(mac_as_bytes, extracted_mac_as_bytes, "mac does not match");
    }
}
