use std::aes128::aes128_encrypt;
fn main(p: [u8; 16], iv: [u8; 16], key: [u8; 16]) -> pub [u8; 32] {
    let result = aes128_encrypt(p, iv, key);
    result
}

