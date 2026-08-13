pub(crate) const MSM_ASSEMBLY: &str = "
                ; We are passed three pointers and one usize.
                ; d0 points to the points. Points are represented by (x: Field, y: Field).
                ; d1 points to the scalars. Scalars are represented by (lo: Field, hi: Field) both range checked to 128 bits.
                ; d2 contains the number of points.
                ; d3 points to the result. The result is a point.
                ADD d3, /*the reserved register 'one_usize'*/ $2, d4; Compute the pointer to the result y.
                ; Initialize the msm result: point at infinity
                SET i3, 0 ff
                SET i4, 0 ff
                ; Loop globals
                SET d6, 0 u32; Initialize the outer loop variable, ranging from 0 to the number of points
                SET d8, 0 ff; Initialize a 0 FF
                SET d9, 254 u32; Initialize a constant 254
                SET d7, 126 u32; Initialize a constant 126 for the most significant bits of the scalar
                SET d10, 128 u32; Initialize a constant 128
                SET d11, 1 u1; Initialize a constant true
                SET d12, 0 u1; Initialize a constant false
                SET d13, 2 u32; Initialize a constant 2 for computing pointers to point and scalar components
                SET d29, 201385395114098847380338600778089168199 ff; Low 128 bits of the Grumpkin scalar field modulus
                SET d30, 64323764613183177041862057485226039389 ff; High 126 bits of the Grumpkin scalar field modulus
                ; Main loop: iterate over the points/scalars
OUTER_HEAD:     LT d6, d2, d15 ; Check if we are done with the outer loop
                JUMPI d15, OUTER_BODY
                JUMP OUTER_END
OUTER_BODY:     MUL d6, d13, d16; Compute the pointer to the point
                ADD d16, d0, d16;
                MUL d6, d13, d17; Compute the pointer to the scalar lo
                ADD d17, d1, d17
                ADD d17, $2, d18; Compute the pointer to the scalar hi
                ; Enforce scalar is in range before using it: lo + hi * 2^128 < Grumpkin scalar field modulus
                ; as native Brillig/ACVM enforces. The TORADIXBE decompositions below already reject lo >= 2^128
                ; and hi >= 2^126 via truncation errors, but on their own they accept scalars in [modulus, 2^254).
                ; Check logic is: scalar < modulus iff scalar_hi < modulus_hi, or scalar_hi == modulus_hi && scalar_lo < modulus_lo
                EQ i18, d30, d31; Check if the scalar_hi == modulus_hi
                LT i17, d29, d32; Check if the scalar_lo < modulus_lo
                AND d31, d32, d31; hi == modulus_hi && lo < modulus_lo
                LT i18, d30, d32; Check if the scalar_hi < modulus_hi
                OR d31, d32, d31; Check if scalar < modulus, i.e. (hi == modulus_hi && lo < modulus_lo) || scalar_hi < modulus_hi
                DIV d11, d31, d31; Branchless assertion, d11 = 1, d31 = 0 if scalar >= modulus, d31 = 1 if scalar < modulus. Div-by-zero will throw if scalar >= modulus matching the native Brillig/ACVM behavior
                EQ i17, d8, d19; Check if the scalar lo is zero
                EQ i18, d8, d20; Check if the scalar hi is zero
                AND d19, d20, d19; Check if both scalars are zero
                JUMPI d19, VALIDATE_ZERO_SCALAR_POINT; If both scalar limbs are zero, validate the point then continue
                ; Decompose the scalars to an array of 254 bits
                ; Allocate a 254 bit array
                MOV $1, d19; Move the free memory pointer to d19, where we'll store the bits
                ADD $1, d9, $1; Increase the free memory pointer by 254
                TORADIXBE /*hi*/ i18, /*radix=2*/ d13, /*num_limbs=126*/ d7, /*output_bits=true*/ d11, /*start of bit array*/ i19; Get the most significant bits of the full scalar
                ADD d19, d7, d20; Create a pointer to the low significance part of the 254 bit array
                TORADIXBE /*lo*/ i17, /*radix=2*/ d13, /*num_limbs=128*/ d10, /*output_bits=true*/ d11, /*middle of bit array*/ i20; Get the least significant bits of the full scalar
                ; Now we have a pointer (i19) to the bits of the scalar in BE
                ADD d19, d9, d21; Initialize the end pointer of the bits, will be used later

                ; Now we need to find the pointer to the MSB
                ; We don't need to put a head in the loop since we know that there must be a 1 at some point
                ; due to the previous check
FIND_MSB_BODY:  JUMPI i19, FIND_MSB_END; Check if the current bit is one
                ADD d19, $2, d19; Increment the pointer of the MSB
                JUMP FIND_MSB_BODY
                ; Now we have the pointer of the MSB in d19

                ; Now store the result of the scalar multiplication in d22, d23
FIND_MSB_END:   MOV i16, d22; x
                ADD d16, $2, d25; pointer to y
                MOV i25, d23; y
                ; Also store the original point in d25, d26
                MOV d22, d25; x
                MOV d23, d26; y

                ; Now we need to do the inner loop, that will do double then add
                ; We need to iterate from the pointer of the MSB + 1 to the end pointer (d21)
                ADD d19, $2, d19; We start from the pointer of the MSB + 1
INNER_HEAD:     LT d19, d21, d28; Check if we are done with the loop
                JUMPI d28, INNER_BODY
                JUMP INNER_END
INNER_BODY:     ECADD d22, d23, d22, d23, /*not indirect, so the result is stored in d22, d23*/ d22; Double the current result.
                EQ i19, d12, d28; Check if the current bit is zero
                JUMPI d28, INNER_INC; If the current bit is zero, continue
                ECADD d25, d26, d22, d23, /*not indirect, so the result is stored in d22, d23*/ d22; Add the original point to the result
INNER_INC:      ADD d19, $2, d19; Increment the pointer
                JUMP INNER_HEAD

                ; After the inner loop we have computed the scalar multiplication. Add it to the msm result
INNER_END:      ECADD i3, i4, d22, d23, i3; Add the result to the msm result
OUTER_INC:      ADD d6, $2, d6; Increment the outer loop variable
                JUMP OUTER_HEAD
                ; After the outer loop we have computed the msm. We can return since we wrote the result in i3, i4
OUTER_END:      INTERNALRETURN

                ; A zero scalar skips the loop where point validation takes place (inside ECADD), but Brillig/native validates /before/ the loop.
                ; To mirror this we perform a 'dummy' ECADD (P + O = P) which throws if the point is not on the curve.
VALIDATE_ZERO_SCALAR_POINT: MOV i16, d22; x
                ADD d16, $2, d25; pointer to y
                MOV i25, d23; y
                ; Note: d8 (=0) used as the (0,0) infinity coords here - if the infinity rep changes, update this.
                ECADD d22, d23, d8, d8, /*not indirect, so the result (= point) is stored in d22, d23*/ d22; Add the original point to infinity
                JUMP OUTER_INC; Skip this zero-scalar term
";

#[cfg(test)]
mod tests {
    use super::*;
    use crate::procedures::{compiler::compile, parser::parse};

    #[test]
    fn smoke_parse_msm() {
        parse(MSM_ASSEMBLY).expect("Failed to parse MSM assembly");
    }

    #[test]
    fn smoke_compile_msm() {
        let parsed = parse(MSM_ASSEMBLY).expect("Failed to parse MSM assembly");
        compile(parsed).expect("Failed to compile MSM assembly");
    }
}
