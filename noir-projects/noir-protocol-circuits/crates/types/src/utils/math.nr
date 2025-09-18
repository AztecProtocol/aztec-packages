pub fn is_power_of_2(n: u16) -> bool {
    if n == 0 {
        false
    } else {
        // See https://graphics.stanford.edu/~seander/bithacks.html#DetermineIfPowerOf2
        n & (n - 1) == 0
    }
}

#[test]
fn test_is_power_of_2() {
    assert(is_power_of_2(0) == false);
    assert(is_power_of_2(1) == true);
    assert(is_power_of_2(2) == true);
    assert(is_power_of_2(3) == false);
    assert(is_power_of_2(4) == true);
    assert(is_power_of_2(5) == false);
    assert(is_power_of_2(6) == false);
    assert(is_power_of_2(7) == false);
    assert(is_power_of_2(8) == true);
}
