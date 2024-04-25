
#[oracle(aes128Encrypt)]
pub fn aes128_encrypt_oracle<N, M>(input: [u8; N], iv: [u8; 16], key: [u8; 16]) -> [u8; M] {}

unconstrained pub fn aes128_encrypt<N, M>(input: [u8; N], iv: [u8; 16], key: [u8; 16]) -> [u8; M] {
    aes128_encrypt_oracle(input, iv, key)
}
