//! AES encryption/decryption tests using FfiBackend
//!
//! Ported from zkpassport/aztec-packages bb_rs aes_tests.rs

#[cfg(test)]
use barretenberg_rs::{backends::FfiBackend, BarretenbergApi};

/// Apply PKCS#7 padding to input data (for testing purposes)
#[cfg(test)]
fn apply_pkcs7_padding(input: &[u8]) -> Vec<u8> {
    let block_size = 16;
    let padding_len = block_size - (input.len() % block_size);
    let mut padded = input.to_vec();
    padded.extend(vec![padding_len as u8; padding_len]);
    padded
}

/// Remove PKCS#7 padding from decrypted data (for testing purposes)
#[cfg(test)]
fn remove_pkcs7_padding(data: &[u8]) -> Result<Vec<u8>, &'static str> {
    if data.is_empty() {
        return Err("Empty data");
    }

    let padding_len = data[data.len() - 1] as usize;
    if padding_len == 0 || padding_len > 16 {
        return Err("Invalid padding");
    }

    if data.len() < padding_len {
        return Err("Data too short for padding");
    }

    // Verify all padding bytes are correct
    for i in 0..padding_len {
        if data[data.len() - 1 - i] != padding_len as u8 {
            return Err("Invalid padding bytes");
        }
    }

    Ok(data[..data.len() - padding_len].to_vec())
}

#[test]
fn test_aes_encrypt_decrypt_roundtrip() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let plaintext = b"Hello, AES world! This is a test message for encryption.";
    let key = [
        0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f,
        0x3c,
    ]; // 128-bit key
    let iv = [
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
        0x0f,
    ]; // 128-bit IV

    // Apply padding before encryption (simulating TypeScript layer behavior)
    let padded_plaintext = apply_pkcs7_padding(plaintext);
    let length = padded_plaintext.len() as u32;

    let encrypt_response = api
        .aes_encrypt(&padded_plaintext, &iv, &key, length)
        .expect("aes_encrypt failed");
    let ciphertext = &encrypt_response.ciphertext;

    assert_ne!(ciphertext.as_slice(), plaintext);
    assert!(!ciphertext.is_empty());

    let decrypt_response = api
        .aes_decrypt(ciphertext, &iv, &key, length)
        .expect("aes_decrypt failed");
    let decrypted_with_padding = &decrypt_response.plaintext;

    // Remove padding after decryption
    let decrypted =
        remove_pkcs7_padding(decrypted_with_padding).expect("Failed to remove padding");

    // The decrypted data should match the original plaintext exactly
    assert_eq!(decrypted, plaintext, "Decrypted data doesn't match plaintext");

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_aes_buffer_encrypt_decrypt() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let plaintext = b"AES buffer test message";
    let key = [
        0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f,
        0x3c,
    ];
    let iv = [
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
        0x0f,
    ];

    // Apply padding before encryption
    let padded_plaintext = apply_pkcs7_padding(plaintext);
    let length = padded_plaintext.len() as u32;

    let encrypt_response = api
        .aes_encrypt(&padded_plaintext, &iv, &key, length)
        .expect("aes_encrypt failed");
    assert!(!encrypt_response.ciphertext.is_empty());

    let decrypt_response = api
        .aes_decrypt(&encrypt_response.ciphertext, &iv, &key, length)
        .expect("aes_decrypt failed");
    let decrypted_with_padding = &decrypt_response.plaintext;

    // Remove padding after decryption
    let decrypted =
        remove_pkcs7_padding(decrypted_with_padding).expect("Failed to remove padding");

    assert_eq!(decrypted, plaintext, "Decrypted data doesn't match plaintext");

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_aes_different_keys_produce_different_outputs() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let plaintext = b"Test message for key difference";
    let key1 = [
        0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f,
        0x3c,
    ];
    let key2 = [
        0x3c, 0x4f, 0xcf, 0x09, 0x88, 0x15, 0xf7, 0xab, 0xa6, 0xd2, 0xae, 0x28, 0x16, 0x15, 0x7e,
        0x2b,
    ];
    let iv = [
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
        0x0f,
    ];

    // Apply padding before encryption
    let padded_plaintext = apply_pkcs7_padding(plaintext);
    let length = padded_plaintext.len() as u32;

    let encrypt_response1 = api
        .aes_encrypt(&padded_plaintext, &iv, &key1, length)
        .expect("aes_encrypt failed");
    let encrypt_response2 = api
        .aes_encrypt(&padded_plaintext, &iv, &key2, length)
        .expect("aes_encrypt failed");

    // Different keys should produce different ciphertexts
    assert_ne!(encrypt_response1.ciphertext, encrypt_response2.ciphertext);

    api.destroy().expect("Failed to destroy backend");
}

#[test]
fn test_aes_deterministic() {
    let backend = FfiBackend::new().expect("Failed to create backend");
    let mut api = BarretenbergApi::new(backend);

    let plaintext = b"Deterministic test message";
    let key = [
        0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f,
        0x3c,
    ];
    let iv = [
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
        0x0f,
    ];

    let padded_plaintext = apply_pkcs7_padding(plaintext);
    let length = padded_plaintext.len() as u32;

    let encrypt_response1 = api
        .aes_encrypt(&padded_plaintext, &iv, &key, length)
        .expect("aes_encrypt failed");
    let encrypt_response2 = api
        .aes_encrypt(&padded_plaintext, &iv, &key, length)
        .expect("aes_encrypt failed");

    // Encryption should be deterministic for the same inputs
    assert_eq!(encrypt_response1.ciphertext, encrypt_response2.ciphertext);

    api.destroy().expect("Failed to destroy backend");
}
