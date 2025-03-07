global TX_EFFECTS_HASH_INPUT_FIELDS: u32 = 256;

// Convert a 32 byte array to a field element
pub fn field_from_bytes_32_trunc(bytes32: [u8; 32]) -> Field {
    // Use only the first 31 bytes to ensure the result is within the field range
    // This is safe because the BN254 field modulus is about 254 bits, which is less than 31 * 8 = 248 bits
    let mut v = 1;
    let mut result = 0 as Field;

    for i in 0..31 {
        result = result + (bytes32[30 - i] as Field) * v;
        v = v * 256;
    }

    result
}

pub fn blake3_to_field<let N: u32>(bytes_to_hash: [u8; N]) -> Field {
    let blake3_hashed = std::hash::blake3(bytes_to_hash);
    let hash_in_a_field = field_from_bytes_32_trunc(blake3_hashed);

    hash_in_a_field
}

fn main(tx_effects_hash_input: [Field; TX_EFFECTS_HASH_INPUT_FIELDS]) -> pub Field {
    let mut hash_input_flattened = [0; TX_EFFECTS_HASH_INPUT_FIELDS * 32];
    for offset in 0..TX_EFFECTS_HASH_INPUT_FIELDS {
        let input_as_bytes: [u8; 32] = tx_effects_hash_input[offset].to_be_bytes();
        for byte_index in 0..32 {
            hash_input_flattened[offset * 32 + byte_index] = input_as_bytes[byte_index];
        }
    }

    let blake3_digest = blake3_to_field(hash_input_flattened);
    blake3_digest
}
