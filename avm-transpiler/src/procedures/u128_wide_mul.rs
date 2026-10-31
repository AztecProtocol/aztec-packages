// Computes the exact 256-bit product of two U128 integers as low and high U128 limbs.
// Combines wrapping U128 multiplication with field arithmetic to recover the high limb.

pub(crate) const U128_WIDE_MUL_ASSEMBLY: &str = "
                ; Inputs: d0 = a: u128, d1 = b: u128, d2 = inverse(2^128): ff.
                ; Outputs: d3 = lo: u128, d4 = hi: u128, where a*b = hi*2^128 + lo.
                ; Scratch: d5..d8. Inputs and the inverse are preserved.
                MUL d0, d1, d3; U128 multiplication retains the low limb.
                CAST d0, d5 ff
                CAST d1, d6 ff
                MUL d5, d6, d7
                CAST d3, d8 ff
                ; In the field, (a*b - lo) / 2^128 equals the high limb modulo p.
                ; Since hi < 2^128 < p, this residue is the exact integer high limb.
                SUB d7, d8, d7
                MUL d7, d2, d7
                CAST d7, d4 u128
                INTERNALRETURN
";

#[cfg(test)]
mod tests {
    use super::*;
    use crate::procedures::{compiler::compile, parser::parse};

    #[test]
    fn smoke_parse_u128_wide_mul() {
        parse(U128_WIDE_MUL_ASSEMBLY).expect("Failed to parse u128_wide_mul assembly");
    }

    #[test]
    fn smoke_compile_u128_wide_mul() {
        let parsed = parse(U128_WIDE_MUL_ASSEMBLY).expect("Failed to parse u128_wide_mul assembly");
        compile(parsed).expect("Failed to compile u128_wide_mul assembly");
    }
}
