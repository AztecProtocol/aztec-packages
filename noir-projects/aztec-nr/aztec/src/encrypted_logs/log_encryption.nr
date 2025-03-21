use crate::prelude::AztecAddress;
use protocol_types::constants::PRIVATE_LOG_SIZE_IN_FIELDS;

pub global PRIVATE_LOG_CIPHERTEXT_LEN: u32 = PRIVATE_LOG_SIZE_IN_FIELDS - 1; // 1 field for the tag

// TODO: the following should not be here as it's AES128 specific.
// ciphertext_length (2) + 14 bytes pkcs#7 AES padding.
pub(crate) global HEADER_CIPHERTEXT_SIZE_IN_BYTES: u32 = 16;

pub global EPH_PK_X_SIZE_IN_FIELDS: u32 = 1;
pub global EPH_PK_SIGN_BYTE_SIZE_IN_BYTES: u32 = 1;

// (17 - 1) * 31 - 16 - 1 = 479
pub global PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES: u32 = (
    PRIVATE_LOG_CIPHERTEXT_LEN - EPH_PK_X_SIZE_IN_FIELDS
)
    * 31
    - HEADER_CIPHERTEXT_SIZE_IN_BYTES
    - EPH_PK_SIGN_BYTE_SIZE_IN_BYTES;
// Each field of the original note log was serialized to 32 bytes. Below we convert the bytes back to fields.
// 479 / 32 = 15
pub global PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS: u32 = PRIVATE_LOG_PLAINTEXT_SIZE_IN_BYTES / 32;

pub trait LogEncryption {
    fn encrypt_log<let PLAINTEXT_LEN: u32>(
        plaintext: [Field; PLAINTEXT_LEN],
        recipient: AztecAddress,
    ) -> [Field; PRIVATE_LOG_CIPHERTEXT_LEN];

    unconstrained fn decrypt_log(
        ciphertext: BoundedVec<Field, PRIVATE_LOG_CIPHERTEXT_LEN>,
        recipient: AztecAddress,
    ) -> BoundedVec<Field, PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS>;
}
