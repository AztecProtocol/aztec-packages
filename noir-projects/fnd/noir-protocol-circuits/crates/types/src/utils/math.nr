pub fn is_power_of_2(n: u16) -> bool {
    if n == 0 {
        false
    } else {
        // See https://graphics.stanford.edu/~seander/bithacks.html#DetermineIfPowerOf2
        n & (n - 1) == 0
    }
}

// TODO: make the above generic for all uint types.
pub fn is_power_of_2_u32(n: u32) -> bool {
    if n == 0 {
        false
    } else {
        // See https://graphics.stanford.edu/~seander/bithacks.html#DetermineIfPowerOf2
        n & (n - 1) == 0
    }
}

#[test]
fn test_is_power_of_2() {
    for i in 0..65 {
        let n = i as u16;
        let expected =
            (n == 1) | (n == 2) | (n == 4) | (n == 8) | (n == 16) | (n == 32) | (n == 64);
        assert(is_power_of_2(n) == expected);
    }
}

#[test]
fn test_is_power_of_2_u32() {
    for i in 0..65 {
        let n = i as u32;
        let expected =
            (n == 1) | (n == 2) | (n == 4) | (n == 8) | (n == 16) | (n == 32) | (n == 64);
        assert(is_power_of_2_u32(n) == expected);
    }
}
