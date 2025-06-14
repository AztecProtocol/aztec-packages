use dep::aztec::macros::aztec;

#[aztec]
contract AvmGadgetsTest {
    use dep::aztec::macros::functions::public;

    #[public]
    fn keccak_hash(data: [u8; 10]) -> [u8; 32] {
        keccak256::keccak256(data, data.len())
    }

    #[public]
    fn keccak_f1600(data: [u64; 25]) -> [u64; 25] {
        std::hash::keccak::keccakf1600(data)
    }

    #[public]
    fn poseidon2_hash(data: [Field; 10]) -> Field {
        std::hash::poseidon2::Poseidon2::hash(data, data.len())
    }

    #[public]
    fn sha256_hash_10(data: [u8; 10]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_20(data: [u8; 20]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_30(data: [u8; 30]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_40(data: [u8; 40]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_50(data: [u8; 50]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_60(data: [u8; 60]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_70(data: [u8; 70]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_80(data: [u8; 80]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_90(data: [u8; 90]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_100(data: [u8; 100]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_255(data: [u8; 255]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_256(data: [u8; 256]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_511(data: [u8; 511]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_512(data: [u8; 512]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }

    #[public]
    fn sha256_hash_2048(data: [u8; 2048]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }

    #[public]
    fn pedersen_hash(data: [Field; 10]) -> Field {
        std::hash::pedersen_hash(data)
    }

    #[public]
    fn pedersen_hash_with_index(data: [Field; 10]) -> Field {
        std::hash::pedersen_hash_with_separator(data, /*index=*/ 20)
    }

    use std::ops::arith::WrappingAdd;

    #[contract_library_method]
    fn muldiv(a: u128, b: u128, c: u128) -> u128 {
        assert(c != 0, "division by zero");

        // Split a and b into 64-bit halves
        let a_lo = a & 0xFFFFFFFFFFFFFFFF;
        let a_hi = a >> 64;
        let b_lo = b & 0xFFFFFFFFFFFFFFFF;
        let b_hi = b >> 64;

        // Compute partial products (all fit in u128)
        let lo_lo = a_lo * b_lo;
        let lo_hi = a_lo * b_hi;
        let hi_lo = a_hi * b_lo;
        let hi_hi = a_hi * b_hi;

        // Now we simulate 256-bit addition:
        //   lo_lo + ((lo_hi + hi_lo) << 64) + (hi_hi << 128)

        // First: add lo_hi + hi_lo with carry
        let (mid, carry_mid) = add_with_carry(lo_hi, hi_lo);

        // mid contributes to both low and high 128 bits
        let mid_lo = mid << 64;
        let mid_hi = mid >> 64;

        // Now add low 128 bits: lo_lo + mid_lo
        let (sum_lo, carry_lo) = add_with_carry(lo_lo, mid_lo);

        // Combine high part:
        let mut sum_hi = hi_hi + mid_hi + carry_mid + carry_lo;

        // Now we have full 256-bit result: (sum_hi, sum_lo)
        let result = div_256_by_128(sum_hi, sum_lo, c);
        result
    }

    // Returns (sum, carry)
    #[contract_library_method]
    fn add_with_carry(a: u128, b: u128) -> (u128, u128) {
        let sum = a.wrapping_add(b);
        let carry = if sum < a { 1 } else { 0 };
        (sum, carry)
    }

    // Performs (hi:lo) / denom, returns floor division result
    #[contract_library_method]
    fn div_256_by_128(hi: u128, lo: u128, denom: u128) -> u128 {
        let mut quotient: u128 = 0;
        let mut r_hi = hi;
        let mut r_lo = lo;

        for i in 0..128 {
            let j = 128 - i - 1;
            let overflow = (r_lo & (1 << 127)) != 0;
            r_lo = r_lo << 1;
            r_hi = (r_hi << 1) | (if overflow { 1 } else { 0 });

            if r_hi >= denom {
                r_hi = r_hi - denom;
                quotient = quotient | (1 << j);
            }
        }

        quotient
    }

    #[public]
    fn muldiv_small_values() {
        let a: u128 = 10;
        let b: u128 = 20;
        let c: u128 = 4;
        let result = muldiv(a, b, c);
        assert(result == 50);
    }

    #[public]
    fn muldiv_exact_division() {
        let a: u128 = 1000;
        let b: u128 = 2000;
        let c: u128 = 10;
        let result = muldiv(a, b, c);
        assert(result == 200_000);
    }

    #[public]
    fn muldiv_large_values() {
        let a: u128 = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;
        let b: u128 = 2;
        let c: u128 = 3;
        let result = muldiv(a, b, c);
        assert(result == 226854911280625642308916404954512140970);
    }

    #[public]
    fn muldiv_rounding_down() {
        let a: u128 = 5;
        let b: u128 = 5;
        let c: u128 = 3;
        let result = muldiv(a, b, c);
        assert(result == (5 * 5) / 3); // 25 / 3 = 8
    }

    #[public]
    fn muldiv_division_by_one() {
        let a: u128 = 123456789;
        let b: u128 = 987654321;
        let c: u128 = 1;
        let result = muldiv(a, b, c);
        assert(result == a * b);
    }

    #[public]
    fn muldiv_large_10_times() {
        for _i in 0..10 {
            let a: u128 = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;
            let b: u128 = 2;
            let c: u128 = 3;
            let result = muldiv(a, b, c);
            assert(result == 226854911280625642308916404954512140970);
        }
    }

    #[public]
    fn add_with_carry_no_overflow() {
        let a: u128 = 100;
        let b: u128 = 200;
        let (sum, carry) = add_with_carry(a, b);
        assert(sum == 300);
        assert(carry == 0);
    }

    #[public]
    fn add_with_carry_with_overflow() {
        let a: u128 = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;
        let b: u128 = 1;
        let (sum, carry) = add_with_carry(a, b);
        assert(sum == 0);
        assert(carry == 1);
    }

    #[public]
    fn div_256_by_128_exact() {
        // (hi, lo) = (0, 1000), c = 10 => expect 100
        let result = div_256_by_128(0, 1000, 10);
        assert(result == 100);
    }

    #[public]
    fn div_256_by_128_exact_10_times() {
        for _i in 0..10 {
            let result = div_256_by_128(0, 1000, 10);
            assert(result == 100);
        }
    }

    #[public]
    fn div_256_by_128_large_hi() {
        // 2^128 / 2 = 2^127
        let hi: u128 = 1;
        let lo: u128 = 0;
        let c: u128 = 2;
        let result = div_256_by_128(hi, lo, c);
        assert(result == (1 as u128 << 127));
    }

    #[public]
    fn div_256_by_128_non_exact() {
        // (hi:lo) = (0, 1000), c = 3 => expect 333
        let result = div_256_by_128(0, 1000, 3);
        assert(result == 333);
    }
}
