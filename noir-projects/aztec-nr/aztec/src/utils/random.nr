use crate::oracle::random::random;

/// Returns as many random bytes as specified through N.
pub unconstrained fn get_random_bytes<let N: u32>() -> [u8; N] {
    let mut bytes = [0; N];
    let mut idx = 32;
    let mut randomness = [0; 32];
    for i in 0..N {
        if idx == 32 {
            randomness = random().to_be_bytes();
            idx = 1; // Skip the first byte as it's always 0.
        }
        bytes[i] = randomness[idx];
        idx += 1;
    }
    bytes
}

/// Just like `random`, but returns a field that fits in `N` bytes.
pub unconstrained fn random_with_max_byte_size<let N: u32>() -> Field {
    let random_field = random();

    // We convert the field to the desired number of bytes, and then back to a field
    let random_field_as_bytes: [u8; N] = random_field.to_be_bytes();
    let reconstructed_field = Field::from_be_bytes::<N>(random_field_as_bytes);

    // We assert that the max byte size is as expected
    reconstructed_field.assert_max_bit_size::<8 * N>();

    reconstructed_field
}
