use std::ops::WrappingMul;

global MUL_DE_BRUIJN_BIT: [u32; 128] = [
    1, 14, 2, 15, 26, 20, 3, 16, 68, 80, 27, 21, 56, 50, 4, 17, 65, 96, 69, 81, 105, 99, 28, 22, 86,
    90, 57, 51, 72, 42, 5, 126, 18, 66, 48, 94, 97, 84, 70, 124, 82, 122, 106, 100, 114, 108, 29,
    23, 77, 102, 87, 91, 119, 116, 58, 52, 61, 110, 73, 37, 43, 31, 6, 127, 13, 25, 19, 67, 79, 55,
    49, 64, 95, 104, 98, 85, 89, 71, 41, 125, 47, 93, 83, 123, 121, 113, 107, 76, 101, 118, 115, 60,
    109, 36, 30, 12, 24, 78, 54, 63, 103, 88, 40, 46, 92, 120, 112, 75, 117, 59, 35, 11, 53, 62, 39,
    45, 111, 74, 34, 10, 38, 44, 33, 9, 32, 8, 7, 128,
];

/// Get the most significant bit position of a `val` (unconstrained)
///
/// Bit hack that uses De Bruijn sequence to calculate msb position in log(N)
/// See [IntegerLog2DeBruijn](https://graphics.stanford.edu/~seander/bithacks.html#IntegerLogDeBruijn)
pub(crate) unconstrained fn get_msb(x: u128) -> u32 {
    let result: u32 = if x == 0 {
        0
    } else {
        let mut v: u128 = x;
        v |= v >> 1;
        v |= v >> 2;
        v |= v >> 4;
        v |= v >> 8;
        v |= v >> 16;
        v |= v >> 32;
        v |= v >> 64;
        let index: u128 = (v.wrapping_mul(0x1FC10C2FBCF471B913B14CD2595D6D5)) >> 121;
        MUL_DE_BRUIJN_BIT[index as u32]
    };
    result
}

mod tests {
    use crate::constants::{TWO_POW_120, TWO_POW_60};
    use crate::fns::unconstrained_helpers::__get_msb;
    use super::get_msb as get_msb128;
    use std::ops::WrappingMul;

    fn assert_msb_equal(x: u64) {
        // Safety: test code
        let msb64 = unsafe { get_msb64(x) };
        // Safety: test code
        let msb128 = unsafe { get_msb128(x as u128) };
        assert_eq(msb64, msb128);
    }

    #[test]
    /// Check that the msb functions are equivalent with de bruijn sequence for 64 bits and 128 bits
    fn test_get_msb() {
        // Test case 1: MSB at position 7
        let x: u64 = 0x80; // binary: 10000000
        assert_msb_equal(x);

        // Test case 2: MSB at position 0
        let x: u64 = 0x1; // binary: 00000001
        assert_msb_equal(x);

        // Test case 3: MSB at position 63
        let x: u64 = 0x8000000000000000; // binary: 1000...0000 (63 zeros)
        assert_msb_equal(x);

        // Test case 4: Zero input
        let x: u64 = 0x0;
        assert_msb_equal(x);

        // Test case 5: All bits set
        let x: u64 = 0xFFFFFFFFFFFFFFFF;
        assert_msb_equal(x);
    }

    /// Multiple entires in the `MUL_DE_BRUIJN_BIT` list do not map to a valid output of `v * 0x6c04f118e9966f6b`.
    /// This is a dummy value to fill the gaps in the map.
    global n1: u32 = 0xffffffff;

    global MUL_DE_BRUIJN_BIT_64: [u32; 128] = [
        0, // change to 1 if you want bitSize(0) = 1
        48, n1, n1, 31, n1, 15, 51, n1, 63, 5, n1, n1, n1, 19, n1, 23, 28, n1, n1, n1, 40, 36, 46,
        n1, 13, n1, n1, n1, 34, n1, 58, n1, 60, 2, 43, 55, n1, n1, n1, 50, 62, 4, n1, 18, 27, n1,
        39, 45, n1, n1, 33, 57, n1, 1, 54, n1, 49, n1, 17, n1, n1, 32, n1, 53, n1, 16, n1, n1, 52,
        n1, n1, n1, 64, 6, 7, 8, n1, 9, n1, n1, n1, 20, 10, n1, n1, 24, n1, 29, n1, n1, 21, n1, 11,
        n1, n1, 41, n1, 25, 37, n1, 47, n1, 30, 14, n1, n1, n1, n1, 22, n1, n1, 35, 12, n1, n1, n1,
        59, 42, n1, n1, 61, 3, 26, 38, 44, n1, 56,
    ];

    pub(crate) unconstrained fn get_msb64(x: u64) -> u32 {
        let mut v: u64 = x;
        v |= v >> 1;
        v |= v >> 2;
        v |= v >> 4;
        v |= v >> 8;
        v |= v >> 16;
        v |= v >> 32;
        let index: u64 = (v.wrapping_mul(0x6c04f118e9966f6b)) >> 57;
        (index as Field).assert_max_bit_size::<32>();
        MUL_DE_BRUIJN_BIT_64[index as u32]
    }

    unconstrained fn __get_msb64<let N: u32>(val: [u128; N]) -> u32 {
        let mut count: u32 = 0;
        for i in 0..N {
            let v: u128 = val[((N) - 1 - i)];
            let v_low: u64 = v as u64 % TWO_POW_60 as u64;
            let v_high: u64 = ((v - v_low as u128) / TWO_POW_60) as u64;
            if (v_high > 0) {
                count = 60 * ((2 * N) - 1 - (i * 2)) + get_msb64(v_high);
                break;
            }
            if (v_low > 0) {
                count = 60 * ((2 * N) - 1 - (i * 2 + 1)) + get_msb64(v_low);
                break;
            }
        }
        count
    }

    #[test]
    // Check that the msb functions are equivalent with De Bruijn sequence for 64 bits and 128 bits
    unconstrained fn test_get_msb_equivalence() {
        // Test single limb (64-bit number)
        let x: Field = 0x8000000000000000;
        let arr: [u128; 4] = [0, 0, x as u128, 0];
        let msb1: u32 = __get_msb64(arr);
        let msb2: u32 = __get_msb(arr);
        assert_eq(msb1, msb2);

        // Test multiple limbs (120-bit number)
        let x: Field = 0x800000000000000000000000000000; // 120 bits number, 2^119
        let arr: [u128; 4] = [0, 0, x as u128, 0];
        let msb1: u32 = __get_msb64(arr);
        let msb2: u32 = __get_msb(arr);
        assert_eq(msb1, msb2);

        // Test zero
        let arr: [u128; 4] = [0, 0, 0, 0];
        let msb1: u32 = __get_msb64(arr);
        let msb2: u32 = __get_msb(arr);
        assert_eq(msb1, msb2);

        // Test all bits set (120 bits)
        let x: Field = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF; // 120 bits, 2^120 - 1
        let arr: [u128; 4] = [0, x as u128, 0, 0];
        let msb1: u32 = __get_msb64(arr);
        let msb2: u32 = __get_msb(arr);
        assert_eq(msb1, msb2);

        // Test systematic bit positions
        for i in 0..120 {
            let x: u128 = 1;
            let shifted: u128 = x << i;
            let arr: [u128; 4] = [0, shifted, 0, 0];
            let msb1: u32 = __get_msb64(arr);
            let msb2: u32 = __get_msb(arr);
            assert_eq(msb1, msb2);
        }

        // Test random-like patterns (multiple bits set)
        let patterns: [Field; 7] = [
            0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA, // alternating bits
            0x555555555555555555555555555555, // alternating bits (opposite)
            0x1234567890ABCDEF1234567890ABCD, // some pattern
            0xFEDCBA0987654321FEDCBA09876543, // some pattern
            0x800000000000000000000000000001, // highest and lowest bits
            0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFE, // all bits except lowest
            0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFF, // all bits except highest
        ];
        for i in 0..patterns.len() {
            let arr: [u128; 4] = [0, patterns[i] as u128, 0, 0];
            let msb1: u32 = __get_msb64(arr);
            let msb2: u32 = __get_msb(arr);
            assert_eq(msb1, msb2);
        }

        // Test with MSB in different array positions (120 bits)
        let x: Field = 0x800000000000000000000000000000; // 120 bits
        let arr1: [u128; 4] = [x as u128, 0, 0, 0];
        let arr2: [u128; 4] = [0, x as u128, 0, 0];
        let arr3: [u128; 4] = [0, 0, x as u128, 0];
        let arr4: [u128; 4] = [0, 0, 0, x as u128];
        let msb1_1: u32 = __get_msb64(arr1);
        let msb2_1: u32 = __get_msb(arr1);
        assert_eq(msb1_1, msb2_1);

        let msb1_2: u32 = __get_msb64(arr2);
        let msb2_2: u32 = __get_msb(arr2);
        assert_eq(msb1_2, msb2_2);

        let msb1_3: u32 = __get_msb64(arr3);
        let msb2_3: u32 = __get_msb(arr3);
        assert_eq(msb1_3, msb2_3);

        let msb1_4: u32 = __get_msb64(arr4);
        let msb2_4: u32 = __get_msb(arr4);
        assert_eq(msb1_4, msb2_4);
    }

    #[test]
    unconstrained fn fuzz_get_msb(seed: [u128; 5]) {
        let mut seed_copy: [u128; 5] = seed;
        for i in 0..5 {
            seed_copy[i] = seed_copy[i] & (TWO_POW_120 - 1);
        }
        let msb1: u32 = __get_msb64(seed_copy);
        let msb2: u32 = __get_msb(seed_copy);
        assert_eq(msb1, msb2);
    }
}
