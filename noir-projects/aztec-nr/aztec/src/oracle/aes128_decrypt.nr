#[oracle(aztec_utl_decryptAes128)]
unconstrained fn aes128_decrypt_oracle<let N: u32>(
    ciphertext: BoundedVec<u8, N>,
    iv: [u8; 16],
    sym_key: [u8; 16],
) -> Option<BoundedVec<u8, N>> {}

/// Attempts to decrypt a ciphertext using AES128.
///
/// Returns `Option::some(plaintext)` on success, or `Option::none()` if decryption fails (e.g. due to malformed
/// ciphertext). Note that decryption with the wrong key will still return `Some` with garbage data, it's up to
/// the calling function to verify correctness (e.g. via a MAC check).
///
/// Note that we accept ciphertext as a BoundedVec, not as an array. This is because this function is typically used
/// when processing logs and at that point we don't have comptime information about the length of the ciphertext as
/// the log is not specific to any individual note.
// TODO(F-498): review naming consistency
pub unconstrained fn try_aes128_decrypt<let N: u32>(
    ciphertext: BoundedVec<u8, N>,
    iv: [u8; 16],
    sym_key: [u8; 16],
) -> Option<BoundedVec<u8, N>> {
    aes128_decrypt_oracle(ciphertext, iv, sym_key)
}

mod test {
    use crate::{
        keys::ecdh_shared_secret::compute_app_siloed_shared_secret,
        messages::encryption::aes128::derive_aes_symmetric_key_and_iv_from_shared_secret,
        utils::{array::subarray::subarray, point::point_from_x_coord},
    };
    use crate::protocol::address::AztecAddress;
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::try_aes128_decrypt;
    use poseidon::poseidon2::Poseidon2;
    use std::aes128::aes128_encrypt;

    global CONTRACT_ADDRESS: AztecAddress = AztecAddress { inner: 42 };
    global TEST_PLAINTEXT_LENGTH: u32 = 10;
    global TEST_CIPHERTEXT_LENGTH: u32 = 16;
    global TEST_PADDING_LENGTH: u32 = TEST_CIPHERTEXT_LENGTH - TEST_PLAINTEXT_LENGTH;

    #[test]
    unconstrained fn aes_encrypt_then_decrypt() {
        let env = TestEnvironment::new();

        env.utility_context(|_| {
            let shared_secret_point = point_from_x_coord(1).unwrap();
            let s_app = compute_app_siloed_shared_secret(shared_secret_point, CONTRACT_ADDRESS);

            let (sym_key, iv) = derive_aes_symmetric_key_and_iv_from_shared_secret::<1>(s_app)[0];

            let plaintext: [u8; TEST_PLAINTEXT_LENGTH] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

            let ciphertext: [u8; TEST_CIPHERTEXT_LENGTH] = aes128_encrypt(plaintext, iv, sym_key);

            let ciphertext_bvec = BoundedVec::<u8, TEST_CIPHERTEXT_LENGTH>::from_array(ciphertext);

            let received_plaintext = try_aes128_decrypt(ciphertext_bvec, iv, sym_key).unwrap();
            assert_eq(received_plaintext.len(), TEST_PLAINTEXT_LENGTH);
            assert_eq(received_plaintext.max_len(), TEST_CIPHERTEXT_LENGTH);
            assert_eq(subarray::<_, _, TEST_PLAINTEXT_LENGTH>(received_plaintext.storage(), 0), plaintext);
            assert_eq(
                subarray::<_, _, TEST_PADDING_LENGTH>(received_plaintext.storage(), TEST_PLAINTEXT_LENGTH),
                [0 as u8; TEST_PADDING_LENGTH],
            );
        })
    }

    global TEST_MAC_LENGTH: u32 = 32;

    #[test(should_fail_with = "mac does not match")]
    unconstrained fn aes_encrypt_then_decrypt_with_bad_sym_key_is_caught() {
        let env = TestEnvironment::new();

        env.utility_context(|_| {
            // The AES decryption oracle will not fail for any valid ciphertext; it will always return
            // `Some` with some data. Whether the decryption was successful is up to the app to check in a
            // custom way.
            //
            // E.g. if it's a note that's been encrypted, upon decryption the app can check whether the
            // note hash exists onchain. If it doesn't, that's a strong indicator that decryption failed.
            //
            // E.g. for non-note messages, the plaintext could include a MAC
            // (https://en.wikipedia.org/wiki/Message_authentication_code). We demonstrate this approach in
            // this test: we compute a MAC, include it in the plaintext, encrypt, and then verify that
            // decryption with a bad key produces a MAC mismatch.
            let shared_secret_point = point_from_x_coord(1).unwrap();
            let s_app = compute_app_siloed_shared_secret(shared_secret_point, CONTRACT_ADDRESS);

            let (sym_key, iv) = derive_aes_symmetric_key_and_iv_from_shared_secret::<1>(s_app)[0];

            let mac_preimage = 0x42;
            let mac = Poseidon2::hash([mac_preimage], 1);
            let mac_as_bytes = mac.to_be_bytes::<TEST_MAC_LENGTH>();

            let plaintext: [u8; TEST_PLAINTEXT_LENGTH] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

            // We append the mac to the plaintext. It doesn't necessarily have to be 32 bytes; that's quite an extreme
            // length. 16 bytes or 8 bytes might be sufficient, and would save on data broadcasting costs. The shorter
            // the mac, the more possibility of false positive decryptions (decryption seemingly succeeding, but the
            // decrypted plaintext being garbage). Some projects use the `iv` (all 16 bytes or the first 8 bytes) as a
            // mac.
            let mut plaintext_with_mac = [0 as u8; TEST_PLAINTEXT_LENGTH + TEST_MAC_LENGTH];
            for i in 0..TEST_PLAINTEXT_LENGTH {
                plaintext_with_mac[i] = plaintext[i];
            }
            for i in 0..TEST_MAC_LENGTH {
                plaintext_with_mac[TEST_PLAINTEXT_LENGTH + i] = mac_as_bytes[i];
            }

            let ciphertext = aes128_encrypt(plaintext_with_mac, iv, sym_key);

            // We now would broadcast the tuple [ciphertext, mac] to the network. The recipient will then decrypt the
            // ciphertext, and if the mac inside the received plaintext matches the mac that was broadcast, then the
            // recipient knows that decryption was successful.

            // For this test, we intentionally mutate the sym_key to a bad one, so that decryption fails. This allows
            // us to explore how the recipient can detect failed decryption by checking the decrypted mac against the
            // broadcasted mac.
            let mut bad_sym_key = sym_key;
            bad_sym_key[0] = 0;

            // We need to convert the array to a BoundedVec because the oracle expects a BoundedVec as it's designed to
            // work with logs of unknown length.
            let ciphertext_bvec = BoundedVec::<u8, 48>::from_array(ciphertext);
            // Decryption with wrong key still returns Some (with garbage).
            let received_plaintext = try_aes128_decrypt(ciphertext_bvec, iv, bad_sym_key).unwrap();

            let extracted_mac_as_bytes: [u8; TEST_MAC_LENGTH] =
                subarray(received_plaintext.storage(), TEST_PLAINTEXT_LENGTH);

            assert_eq(mac_as_bytes, extracted_mac_as_bytes, "mac does not match");
        });
    }
}
