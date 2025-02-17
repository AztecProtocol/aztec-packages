const MSM_ASSEMBLY: &str = "
                ; We are passed two pointers and one usize.
                ; d0 points to the points. Points are represented by (x: Field, y: Field, is_infinite: bool)
                ; d1 points to the scalars. Scalars are represented by (lo: Field, hi: Field) both range checked to 128 bits.
                ; d2 contains the number of points and scalars, which should be the same.

                SET d3, 0 ff ; Initialize the msm result: point at infinity
                SET d4, 0 ff
                SET d5, 1 u1
                ; Loop globals
                SET d6, 0 u32; Initialize the outer loop variable, ranging from 0 to the number of points
                SET d7, 1 u32; Initialize a constant one
                SET d8, 0 ff; Initialize a 0 FF
                SET d9, 256 u32; Initialize a constant 256
                SET d10, 128 u32; Initialize a constant 128
                SET d11, 1 u1; Initialize a constant true
                SET d12, 0 u1; Initialize a constant false
                ; Main loop: iterate over the points/scalars
OUTER_HEAD:       LT d6, d2, d15 ; Check if we are done with the outer loop
                JUMPI d15, OUTER_BODY
                JUMP OUTER_END
OUTER_BODY:       ADD d6, d0, d16; Compute the pointer to the point
                ADD d6, d1, d17; Compute the pointer to the scalar lo
                ADD d9, d7, d18; Compute the pointer to the scalar hi
                EQ i17, d8, d19; Check if the scalar lo is zero
                EQ i18, d8, d20; Check if the scalar hi is zero
                AND d19, d20, d19; Check if both scalars are zero
                JUMPI d19, OUTER_INC; If both scalar limbs are zero, continue
                ; Decompose the scalars to an array of 256 bits
                ; Allocate a 256 bit array
                MOV $1, d19; Move the free memory pointer to d19, where we'll store the bits
                ADD $1, d9, $1; Increase the free memory pointer by 256
                TO_RADIX_BE i18, d7, d10, d11, i19; Get the most significant bits of the full scalar
                ADD d19, d10, d20; Create a pointer to the middle of the 256 bit array
                TO_RADIX_BE i17, d7, d10, d11, i20; Get the least significant bits of the full scalar
                ; Now we have a pointer (i19) to the bits of the scalar in BE

                ; Now we need to find the index of the MSB
                SET d21, 0 u32; Initialize the index of the MSB
FIND_MSB_HEAD:  LT d21, d9, d22; Check if we are done with the loop
                JUMPI d22, FIND_MSB_BODY
                JUMP FIND_MSB_END
FIND_MSB_BODY:  ADD d19, d21, d22; Compute the pointer to the current bit
                EQ i22, d11, d22; Check if the current bit is one
                JUMPI d22, FIND_MSB_END
FIND_MSB_INC:   ADD d21, d7, d21; Increment the index of the MSB
                JUMP FIND_MSB_HEAD
                ; Now we have the index of the MSB in d21

                ; Now store the result of the scalar multiplication in d22, d23, d24
FIND_MSB_END:   MOV i16, d22; x
                ADD i16, d7, d25; pointer to y
                MOV i25, d23; y
                ADD d25, d7, d25; pointer to is_infinite
                MOV i25, d24; is_infinite
                ; Also store the original point in d25, d26, d27
                MOV d22, d25; x
                MOV d23, d26; y
                MOV d24, d27; is_infinite

                ; Now we need to do the inner loop, that will do double then add
                ; We need to iterate from the index of the MSB to 256
INNER_HEAD:     LT d21, d9, d22; Check if we are done with the loop
                JUMPI d22, INNER_BODY
                JUMP INNER_END
INNER_BODY:     ECADD d22, d23, d24, d22, d23, d24, d22; Double the current result. Note the output is not a pointer, so the result is stored in the same addresses
                ADD d19, d21, d22; Compute the pointer to the current bit
                EQ i22, d12, d22; Check if the current bit is zero
                JUMPI d22, INNER_INC; If the current bit is zero, continue
                ECADD d25, d26, d27, d22, d23, d24, d22; Add the original point to the result
INNER_INC:      ADD d21, d7, d21; Increment the index
                JUMP INNER_HEAD

                ; After the inner loop we have computed the scalar multiplication. Add it to the msm result
INNER_END:      ECADD d3, d4, d5, d22, d23, d24, d3; Add the result to the msm result
OUTER_INC:        ADD d6, d7, d6; Increment the outer loop variable
                JUMP OUTER_HEAD
                ; After the outer loop we have computed the msm. Put it back into the first memory addresses
OUTER_END:        MOV d3, d0
                MOV d4, d1
                MOV d5, d2
                RETURN
";
