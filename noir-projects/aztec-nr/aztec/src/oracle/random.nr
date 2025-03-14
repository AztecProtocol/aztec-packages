/// Returns an unconstrained random value. Note that it is not possible to constrain this value to prove that it is
/// truly random: we assume that the oracle is cooperating and returning random values.
/// In some applications this behavior might not be acceptable and other techniques might be more suitable, such as
/// producing pseudo-random values by hashing values outside of user control (like block hashes) or secrets.
pub unconstrained fn random() -> Field {
    rand_oracle()
}

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

#[oracle(getRandomField)]
unconstrained fn rand_oracle() -> Field {}
