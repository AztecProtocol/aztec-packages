use crate::println;

#[foreign(aes128_encrypt)]
pub fn aes128_encrypt<N>(input: [u8; N], iv: [u8; 16], key: [u8; 16]) -> [u8] {}

#[foreign(aes128_encrypt)]
pub fn aes128_encrypt_slice(input: [u8], iv: [u8; 16], key: [u8; 16]) -> [u8] {}
