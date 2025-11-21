fn main(
    input: [u8; 4],
    key: [u8; 16],
    iv: [u8; 16]) -> pub [u8; 16] {
    let ciphertext = std::aes128::aes128_encrypt(input, iv, key);
    ciphertext
}

