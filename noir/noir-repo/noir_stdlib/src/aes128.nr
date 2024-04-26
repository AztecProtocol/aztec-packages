use crate::println;

#[foreign(aes128_encrypt)]
fn _aes128_encrypt(input: [u8], iv: [u8; 16], key: [u8; 16]) -> [u8] {}

// PKCS#7 padding
fn pad(input: [u8]) -> [u8] {
    let mut padded = input;
    let padding = 16 - (input.len() % 16);
    for _i in 0..padding {
        padded = padded.push_back(padding as u8);
    }
    padded
}

pub fn aes128_encrypt_slice(input: [u8], iv: [u8; 16], key: [u8; 16]) -> [u8] {
    _aes128_encrypt(pad(input), iv, key)
}

pub fn aes128_encrypt<N>(input: [u8; N], iv: [u8; 16], key: [u8; 16]) -> [u8] {
    _aes128_encrypt(pad(input.as_slice()), iv, key)
}
