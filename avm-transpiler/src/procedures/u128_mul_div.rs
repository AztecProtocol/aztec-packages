// Computes floor(a * b / d) for U128 operands and a U64 denominator using an exact
// 256-bit intermediate. Rejects zero denominators and quotients that exceed U128.

pub(crate) const U128_MUL_DIV_ASSEMBLY: &str = "
                ; Inputs: d0 = a: u128, d1 = b: u128, d2 = inverse(2^128): ff.
                ; d9 = denominator widened from U64 to U128; d12 = 64: u128.
                ; Output: d21 = floor(a*b / denominator): u128.
                ; Scratch: d3..d8, d10, d13, d16..d18, d20. Inputs are preserved.
                ; Let B = 2^128, K = 2^64, and d = denominator.
                ; Recover N = a*b = hi*B + lo, with d3 = lo and d4 = hi.
                ; (a*b - lo) * inverse(B) in the field is exact because hi < B < p.
                MUL d0, d1, d3
                CAST d0, d5 ff
                CAST d1, d6 ff
                MUL d5, d6, d7
                CAST d3, d8 ff
                SUB d7, d8, d7
                MUL d7, d2, d7
                CAST d7, d4 u128
                ; hi < denominator iff the denominator is nonzero and floor(N/d) < B.
                LT d4, d9, d10
                JUMPI d10, QUOTIENT_FITS
                DIV d10, d10, d10; The failed predicate is zero, so 0/0 rejects the call.
                ; x = hi*K + upper64(lo) < denominator*K < B.
                ; qh = floor(x/d) < K, so Qh = qh*K fits U128.
QUOTIENT_FITS:  SHR d3, d12, d13
                SHL d4, d12, d16
                ADD d16, d13, d16
                DIV d16, d9, d17
                SHL d17, d12, d21
                ; R = N - Qh*d = (x mod d)*K + lower64(lo) < d*K < B.
                ; Thus (lo - Qh*d) mod B is exactly R, even if the MUL wraps.
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
