/*
 * Copyright 2024 Benjamin Edgington
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include "common/utils.h"
#include "common/alloc.h"

#include <assert.h> /* For assert */
#include <stddef.h> /* For size_t */
#include <stdlib.h> /* For NULL */
#include <string.h> /* For memcpy */

/**
 * Utility function to test whether the argument is a power of two.
 *
 * @param[in]   n   The number to test
 *
 * @return True if `n` is zero or a power of two, otherwise false.
 *
 * @remark This method returns true for is_power_of_two(0) which is a bit weird, but not an issue in
 * the contexts in which we use it.
 *
 */
bool is_power_of_two(uint64_t n) {
    return (n & (n - 1)) == 0;
}

/**
 * Calculate log base two of a power of two.
 *
 * @param[in]   n   The power of two
 *
 * @return The log base two of n.
 *
 * @remark In other words, the bit index of the one bit.
 * @remark Works only for n a power of two.
 * @remark Not the fastest implementation, but it doesn't need to be fast.
 */
uint64_t log2_pow2(uint64_t n) {
    uint64_t position = 0;
    while (n >>= 1)
        position++;
    return position;
}

/**
 * Reverse the bit order in a 64-bit integer.
 *
 * @param[in]   n   The integer to be reversed
 *
 * @return An integer with the bits of `n` reversed.
 */
uint64_t reverse_bits(uint64_t n) {
    uint64_t result = 0;
    for (size_t i = 0; i < 64; ++i) {
        result <<= 1;
        result |= (n & 1);
        n >>= 1;
    }
    return result;
}

/**
 * Reverse the low-order bits in a 64-bit integer.
 *
 * @param[in]   n       To reverse `b` bits, set `n = 2 ^ b`
 * @param[in]   value   The bits to be reversed
 *
 * @return The reversal of the lowest log_2(n) bits of the input value.
 *
 * @remark n must be a power of two.
 */
uint64_t reverse_bits_limited(uint64_t n, uint64_t value) {
    size_t unused_bit_len = 64 - log2_pow2(n);
    return reverse_bits(value) >> unused_bit_len;
}

/**
 * Reorder an array in reverse bit order of its indices.
 *
 * @param[in,out]   values  The array, which is re-ordered in-place
 * @param[in]       size    The size in bytes of an element of the array
 * @param[in]       n       The length of the array, must be a power of two strictly greater than 1
 *
 * @remark Operates in-place on the array.
 * @remark Can handle arrays of any type: provide the element size in `size`.
 * @remark This means that `input[n] == output[n']`, where input and output denote the input and
 * output array and n' is obtained from n by bit-reversing n. As opposed to reverse_bits, this
 * bit-reversal operates on log2(n)-bit numbers.
 */
C_KZG_RET bit_reversal_permutation(void *values, size_t size, size_t n) {
    C_KZG_RET ret;
    byte *tmp = NULL;
    byte *v = (byte *)values;

    /* In these cases, do nothing */
    if (n == 0 || n == 1) {
        ret = C_KZG_OK;
        goto out;
    }

    /* Ensure n is a power of two */
    if (!is_power_of_two(n)) {
        ret = C_KZG_BADARGS;
        goto out;
    }

    /* Scratch space for swapping an entry of the values array */
    ret = c_kzg_malloc((void **)&tmp, size);
    if (ret != C_KZG_OK) goto out;

    /* Reorder elements */
    uint64_t unused_bit_len = 64 - log2_pow2(n);
    assert(unused_bit_len <= 63);
    for (size_t i = 0; i < n; i++) {
        uint64_t r = reverse_bits(i) >> unused_bit_len;
        if (r > i) {
            /* Swap the two elements */
            memcpy(tmp, v + (i * size), size);
            memcpy(v + (i * size), v + (r * size), size);
            memcpy(v + (r * size), tmp, size);
        }
    }

out:
    c_kzg_free(tmp);
    return ret;
}

/**
 * Compute and return [ x^0, x^1, ..., x^{n-1} ].
 *
 * @param[out]  out The array to store the powers
 * @param[in]   x   The field element to raise to powers
 * @param[in]   n   The number of powers to compute
 *
 * @remark `out` is left untouched if `n == 0`.
 */
void compute_powers(fr_t *out, const fr_t *x, size_t n) {
    fr_t current_power = FR_ONE;
    for (size_t i = 0; i < n; i++) {
        out[i] = current_power;
        blst_fr_mul(&current_power, &current_power, x);
    }
}

/**
 * Perform pairings and test whether the outcomes are equal in G_T.
 *
 * Tests whether `e(a1, a2) == e(b1, b2)`.
 *
 * @param[in]   a1  A G1 group point for the first pairing
 * @param[in]   a2  A G2 group point for the first pairing
 * @param[in]   b1  A G1 group point for the second pairing
 * @param[in]   b2  A G2 group point for the second pairing
 *
 * @retval true  The pairings were equal
 * @retval false The pairings were not equal
 */
bool pairings_verify(const g1_t *a1, const g2_t *a2, const g1_t *b1, const g2_t *b2) {
    blst_fp12 loop0, loop1, gt_point;
    blst_p1_affine aa1, bb1;
    blst_p2_affine aa2, bb2;

    /*
     * As an optimisation, we want to invert one of the pairings,
     * so we negate one of the points.
     */
    g1_t a1neg = *a1;
    blst_p1_cneg(&a1neg, true);

    blst_p1_to_affine(&aa1, &a1neg);
    blst_p1_to_affine(&bb1, b1);
    blst_p2_to_affine(&aa2, a2);
    blst_p2_to_affine(&bb2, b2);

    blst_miller_loop(&loop0, &aa2, &aa1);
    blst_miller_loop(&loop1, &bb2, &bb1);

    blst_fp12_mul(&gt_point, &loop0, &loop1);
    blst_final_exp(&gt_point, &gt_point);

    return blst_fp12_is_one(&gt_point);
}
