// Computes floor(a * b / d) for U128 operands and denominator using an exact
// 256-bit intermediate. Uses a U64 fast path and rejects zero denominators or
// quotients that exceed U128.

pub(crate) const U128_MUL_DIV_ASSEMBLY: &str = "
                ; Inputs: d0 = a: u128, d1 = b: u128, d2 = inverse(2^128): ff.
                ; d9 = denominator: u128; d12 = 64: u128. Output: d21 = floor(a*b/d9): u128.
                ; Scratch: d3..d10, d13..d43. The denominator scratch copy is normalized in place.
                ; Let B = 2^128, K = 2^64. Recover N = hi*B + lo in d4 and d3.
                ; The field recovery is exact because the true high limb is below B < p.
                MUL d0, d1, d3
                CAST d0, d5 ff
                CAST d1, d6 ff
                MUL d5, d6, d7
                CAST d3, d8 ff
                SUB d7, d8, d7
                MUL d7, d2, d7
                CAST d7, d4 u128
                ; hi < d rejects zero denominators and quotients at least B.
                LT d4, d9, d10
                JUMPI d10, QUOTIENT_FITS
                DIV d10, d10, d10; The failed predicate is zero, so 0/0 rejects the call.
                ; Keep the two-stage U64 algorithm for denominators below K.
QUOTIENT_FITS:  SET d22, 18446744073709551616 u128
                LT d9, d22, d10
                JUMPI d10, SMALL_DENOM
                ; Large denominators use normalized base-K quotient estimates and correction loops.
                SET d23, 1 u128
                SET d24, 128 u128
                SET d25, 18446744073709551615 u128
                SET d26, 18446744073709551616 ff
                SET d27, 32 u128
                SET d28, 79228162514264337593543950336 u128
                SET d29, 16 u128
                SET d30, 5192296858534827628530496329220096 u128
                SET d31, 8 u128
                SET d32, 1329227995784915872903807060280344576 u128
                SET d33, 4 u128
                SET d34, 21267647932558653966460912964485513216 u128
                SET d35, 2 u128
                SET d36, 85070591730234615865843651857942052864 u128
                SET d37, 170141183460469231731687303715884105728 u128
                ; Normalization sets the denominator high bit; s records the shift count.
                SET d38, 0 u128
                LTE d22, d9, d10
                JUMPI d10, NORM64
                SHL d9, d12, d9
                ADD d38, d12, d38
NORM64:         LTE d28, d9, d10
                JUMPI d10, NORM32
                SHL d9, d27, d9
                ADD d38, d27, d38
NORM32:         LTE d30, d9, d10
                JUMPI d10, NORM16
                SHL d9, d29, d9
                ADD d38, d29, d38
NORM16:         LTE d32, d9, d10
                JUMPI d10, NORM8
                SHL d9, d31, d9
                ADD d38, d31, d38
NORM8:          LTE d34, d9, d10
                JUMPI d10, NORM4
                SHL d9, d33, d9
                ADD d38, d33, d38
NORM4:          LTE d36, d9, d10
                JUMPI d10, NORM2
                SHL d9, d35, d9
                ADD d38, d35, d38
NORM2:          LTE d37, d9, d10
                JUMPI d10, NORM1
                SHL d9, d23, d9
                ADD d38, d23, d38
NORM1:          SHL d4, d38, d4
                SUB d24, d38, d39
                SHR d3, d39, d40
                OR d4, d40, d4
                SHL d3, d38, d3
                SHR d3, d12, d13
                AND d3, d25, d14
                SHR d9, d12, d15
                CAST d9, d16 ff
                ; Each base-K estimate may be up to two too large. Compare exact field products
                ; below 2^193 < p, then decrement until the product fits the numerator.
                DIV d4, d15, d17
                CAST d4, d5 ff
                MUL d5, d26, d18
                CAST d13, d19 ff
                ADD d18, d19, d18
                CAST d17, d20 ff
                MUL d20, d16, d41
CORRECT1:       LTE d41, d18, d10
                JUMPI d10, DONE1
                SUB d17, d23, d17
                SUB d41, d16, d41
                JUMP CORRECT1
                ; Carry the exact first-stage remainder into the second quotient digit.
DONE1:          SUB d18, d41, d42
                CAST d42, d4 u128
                DIV d4, d15, d43
                CAST d4, d5 ff
                MUL d5, d26, d18
                CAST d14, d19 ff
                ADD d18, d19, d18
                CAST d43, d20 ff
                MUL d20, d16, d41
CORRECT2:       LTE d41, d18, d10
                JUMPI d10, DONE2
                SUB d43, d23, d43
                SUB d41, d16, d41
                JUMP CORRECT2
DONE2:          SHL d17, d12, d21
                ADD d21, d43, d21
                INTERNALRETURN
                ; For d < K, hi < d makes both division numerators fit U128.
                ; Here R = (lo - Qh*d) mod B is exact because R < d*K < B.
SMALL_DENOM:    SHR d3, d12, d13
                SHL d4, d12, d16
                ADD d16, d13, d16
                DIV d16, d9, d17
                SHL d17, d12, d21
                MUL d21, d9, d18
                SUB d3, d18, d16
                DIV d16, d9, d20
                ADD d21, d20, d21; Qh + floor(R/d) is the complete quotient.
                INTERNALRETURN
";

#[cfg(test)]
mod tests {
    use super::*;
    use crate::procedures::{compiler::compile, parser::parse};

    #[test]
    fn smoke_parse_u128_mul_div() {
        parse(U128_MUL_DIV_ASSEMBLY).expect("Failed to parse u128_mul_div assembly");
    }

    #[test]
    fn smoke_compile_u128_mul_div() {
        let parsed = parse(U128_MUL_DIV_ASSEMBLY).expect("Failed to parse u128_mul_div assembly");
        compile(parsed).expect("Failed to compile u128_mul_div assembly");
    }
}
