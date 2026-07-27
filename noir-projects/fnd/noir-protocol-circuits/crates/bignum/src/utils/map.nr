// Copied from std::array, because I couldn't figure out how to import the `map` method of the weird trait for an array.
// And the reason I wanted direct access to it, is because I couldn't figure out how to implement a double map.
pub(crate) fn map<T, let N: u32, U, Env>(arr: [T; N], f: fn[Env](T) -> U) -> [U; N] {
    let mut ret: [U; N] = std::mem::zeroed();

    for i in 0..N {
        ret[i] = f(arr[i]);
    }

    ret
}

/// reverse an array
pub(crate) fn invert_array<T, let M: u32>(array: [T; M]) -> [T; M] {
    let mut ret: [T; M] = std::mem::zeroed();

    for i in 0..M {
        ret[i] = array[M - i - 1];
    }
    ret
}
