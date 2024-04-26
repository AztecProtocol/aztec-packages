use crate::BlackBoxResolutionError;
use libaes::Cipher;

pub fn aes128_encrypt(
    inputs: &[u8],
    iv: [u8; 16],
    key: [u8; 16],
) -> Result<Vec<u8>, BlackBoxResolutionError> {
    let mut cipher = Cipher::new_128(&key);
    cipher.set_auto_padding(false);
    let encrypted = cipher.cbc_encrypt(&iv, inputs);
    Ok(encrypted)
}
