#[oracle(aztec_utl_decryptAes128)]
unconstrained fn aes128_decrypt_oracle<let N: u32>(
    ciphertext: BoundedVec<u8, N>,
    iv: [u8; 16],
    sym_key: [u8; 16],
) -> Option<BoundedVec<u8, N>> {}

/// Attempts to decrypt a ciphertext using AES128.
///
/// Returns `Option::some(plaintext)` on success, or `Option::none()` if decryption fails (e.g. due to malformed
/// ciphertext or invalid PKCS#7 padding). Note that decryption with the wrong key will almost always return `None`
/// because the decrypted garbage data will have invalid PKCS#7 padding.
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

    #[test]
    unconstrained fn aes_encrypt_then_decrypt_with_bad_sym_key_is_caught() {
        let env = TestEnvironment::new();

        env.utility_context(|_| {
            // Decrypting with the wrong key results in garbage data with invalid PKCS#7 padding,
            // so the oracle returns None.
            let shared_secret_point = point_from_x_coord(1).unwrap();
            let s_app = compute_app_siloed_shared_secret(shared_secret_point, CONTRACT_ADDRESS);

            let (sym_key, iv) = derive_aes_symmetric_key_and_iv_from_shared_secret::<1>(s_app)[0];

            let plaintext: [u8; TEST_PLAINTEXT_LENGTH] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
            let ciphertext: [u8; TEST_CIPHERTEXT_LENGTH] = aes128_encrypt(plaintext, iv, sym_key);

            let mut bad_sym_key = sym_key;
            bad_sym_key[0] = 0;

            let ciphertext_bvec = BoundedVec::<u8, TEST_CIPHERTEXT_LENGTH>::from_array(ciphertext);
            // Decryption with wrong key returns None because the garbage output has invalid PKCS#7 padding.
            let result = try_aes128_decrypt(ciphertext_bvec, iv, bad_sym_key);
            assert(result.is_none(), "decryption with bad key should return None");
        });
    }
}
