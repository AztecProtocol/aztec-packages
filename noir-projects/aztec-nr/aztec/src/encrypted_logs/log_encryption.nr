use crate::prelude::AztecAddress;
use protocol_types::constants::PRIVATE_LOG_SIZE_IN_FIELDS;

pub global PRIVATE_LOG_CIPHERTEXT_LEN: u32 = PRIVATE_LOG_SIZE_IN_FIELDS - 1; // 1 field for the tag

pub trait LogEncryption {
    fn encrypt_log<let PLAINTEXT_LEN: u32>(
        plaintext: [Field; PLAINTEXT_LEN],
        recipient: AztecAddress,
    ) -> [Field; PRIVATE_LOG_CIPHERTEXT_LEN];

    unconstrained fn decrypt_log(
        ciphertext: BoundedVec<Field, PRIVATE_LOG_CIPHERTEXT_LEN>,
        recipient: AztecAddress,
    ) -> BoundedVec<Field, PRIVATE_LOG_CIPHERTEXT_LEN>;
}
