/// Returns an unconstrained random value. Note that it is not possible to constrain this value to prove that it is
/// truly random: we assume that the oracle is cooperating and returning random values.
/// In some applications this behavior might not be acceptable and other techniques might be more suitable, such as
/// producing pseudo-random values by hashing values outside of user control (like block hashes) or secrets.
pub unconstrained fn random() -> Field {
    rand_oracle()
}

/// Just like `random`, but returns a field that fits in `N` bytes.
pub unconstrained fn random_with_max_byte_size<let N: u32>() -> Field {
    let random_field = rand_oracle();

    // We convert the field to the desired number of bytes, and then back to a field
    let random_field_as_bytes: [u8; N] = random_field.to_be_bytes();
    let reconstructed_field = Field::from_be_bytes::<N>(random_field_as_bytes);

    // We assert that the max byte size is as expected
    reconstructed_field.assert_max_bit_size::<8 * N>();

    reconstructed_field
}

#[oracle(getRandomField)]
unconstrained fn rand_oracle() -> Field {}
