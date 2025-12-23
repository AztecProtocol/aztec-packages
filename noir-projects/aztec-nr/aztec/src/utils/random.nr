use crate::oracle::random::random;

/// Returns as many random bytes as specified through N.
pub unconstrained fn get_random_bytes<let N: u32>() -> [u8; N] {
    let mut bytes = [0; N];
    let mut idx = 32;
    let mut randomness = [0; 32];
    for i in 0..N {
        if idx == 32 {
            randomness = random().to_be_bytes();
            idx = 1; // Skip the first byte as it has biased entropy.
        }
        bytes[i] = randomness[idx];
        idx += 1;
    }
    bytes
}

mod test {
    use super::get_random_bytes;

    #[test]
    unconstrained fn get_random_bytes_zero() {
        let bytes: [u8; 0] = get_random_bytes();
        assert_eq(bytes.len(), 0);
    }

    #[test]
    unconstrained fn get_random_bytes_one() {
        let bytes: [u8; 1] = get_random_bytes();
        assert_eq(bytes.len(), 1);
    }

    #[test]
    unconstrained fn get_random_bytes_31() {
        // 31 bytes fits in a single field (using bytes 1-31)
        let bytes: [u8; 31] = get_random_bytes();
        assert_eq(bytes.len(), 31);
    }

    #[test]
    unconstrained fn get_random_bytes_32() {
        // 32 bytes requires two field elements (31 from first, 1 from second)
        let bytes: [u8; 32] = get_random_bytes();
        assert_eq(bytes.len(), 32);
    }

    #[test]
    unconstrained fn get_random_bytes_large() {
        // Test a larger size that spans multiple field elements
        let bytes: [u8; 100] = get_random_bytes();
        assert_eq(bytes.len(), 100);
    }
}
