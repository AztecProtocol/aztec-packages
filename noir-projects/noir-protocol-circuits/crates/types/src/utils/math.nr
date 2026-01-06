pub fn is_power_of_2(n: u16) -> bool {
    if n == 0 {
        false
    } else {
        // See https://graphics.stanford.edu/~seander/bithacks.html#DetermineIfPowerOf2
        n & (n - 1) == 0
    }
}

// TODO: make the above generic for all uint types.
// (I couldn't figure out how to get a generic representation of `1`. It got ugly and worrisome
// using traits std::ops::{Sub, BitAdd}, Eq, and std::mem::zeroed()).
pub fn is_power_of_2_u32(n: u32) -> bool {
    if n == 0 {
        false
    } else {
        // See https://graphics.stanford.edu/~seander/bithacks.html#DetermineIfPowerOf2
        n & (n - 1) == 0
    }
}

// TODO: this test should go as high as the max number of leaves there could possibly be.
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

#[test]
fn test_is_power_of_2_u32() {
    assert(is_power_of_2_u32(0) == false);
    assert(is_power_of_2_u32(1) == true);
    assert(is_power_of_2_u32(2) == true);
    assert(is_power_of_2_u32(3) == false);
    assert(is_power_of_2_u32(4) == true);
    assert(is_power_of_2_u32(5) == false);
    assert(is_power_of_2_u32(6) == false);
    assert(is_power_of_2_u32(7) == false);
    assert(is_power_of_2_u32(8) == true);
}
